import { Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Locale, LoginResponse, MagicLinkRequest } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { magicLinkToken, user } from '../db/schema';
import { AuditLogService } from '../audit/audit-log.service';
import { EmailService } from '../email/email.service';
import { env } from '../env';
import { AuthService, type RequestMeta } from './auth.service';
import {
  generateMagicToken,
  hashMagicToken,
  isMagicTokenUsable,
  magicLinkExpiresAt,
} from './magic-link-token';

/**
 * Passwordless-вход по ссылке из письма — аддитивно рядом с паролем и MFA.
 * Токен одноразовый (consumed_at), с истечением; в БД только его sha256-хеш.
 * Consume проходит через общий пост-верификационный путь AuthService, поэтому
 * при включённой MFA magic-link не обходит второй фактор.
 */
@Injectable()
export class MagicLinkService {
  constructor(
    private readonly dbService: DbService,
    private readonly emailService: EmailService,
    private readonly auditLogService: AuditLogService,
    private readonly authService: AuthService,
  ) {}

  /** Запрос ссылки. Всегда «тихий» успех — существование аккаунта не раскрываем. */
  async request(input: MagicLinkRequest, meta: RequestMeta = {}): Promise<void> {
    const email = input.email.toLowerCase();
    const [found] = await this.dbService.db.select().from(user).where(eq(user.email, email));
    // Нет юзера или деактивирован — выходим молча (одинаковый ответ наружу)
    if (!found || found.status === 'deactivated') return;

    // Одна активная ссылка на юзера: гасим прежние невыпущенные
    await this.dbService.db
      .update(magicLinkToken)
      .set({ consumedAt: new Date() })
      .where(and(eq(magicLinkToken.userId, found.id), isNull(magicLinkToken.consumedAt)));

    const { token, tokenHash } = generateMagicToken();
    await this.dbService.db.insert(magicLinkToken).values({
      userId: found.id,
      tokenHash,
      expiresAt: magicLinkExpiresAt(new Date(), env.magicLinkTtlMinutes),
      requestedIp: meta.ip ?? null,
    });

    const magicUrl = `${env.appUrl}/login/magic?token=${token}`;
    const locale: Locale = input.locale ?? (found.locale as Locale) ?? 'en';
    // Сбой отправки не роняет запрос: наружу всё равно 202 (иначе 500 у реального
    // аккаунта против 202 у выдуманного = оракул существования). Логируем для ops.
    try {
      await this.emailService.sendTemplate('magic-link', locale, email, {
        magicUrl,
        minutes: String(env.magicLinkTtlMinutes),
      });
    } catch (error) {
      console.error(
        'magic-link письмо не отправлено:',
        error instanceof Error ? error.message : error,
      );
    }
    await this.auditLogService.recordAuthEvent({
      userId: found.id,
      event: 'magic_link_requested',
      ...meta,
    });
  }

  /** Обмен ссылки на сессию: одноразово, с проверкой срока; далее — как обычный логин. */
  async consume(token: string, meta: RequestMeta = {}): Promise<LoginResponse> {
    const [row] = await this.dbService.db
      .select()
      .from(magicLinkToken)
      .where(eq(magicLinkToken.tokenHash, hashMagicToken(token)));

    if (!row || !isMagicTokenUsable(row, new Date())) {
      await this.auditLogService.recordAuthEvent({ userId: row?.userId, event: 'failed', ...meta });
      throw new UnauthorizedException('Ссылка недействительна или истекла');
    }

    // Одноразовость: гасим до выдачи токена — повторный переход по ссылке не сработает
    await this.dbService.db
      .update(magicLinkToken)
      .set({ consumedAt: new Date() })
      .where(eq(magicLinkToken.id, row.id));

    const [found] = await this.dbService.db.select().from(user).where(eq(user.id, row.userId));
    if (!found || found.status === 'deactivated') {
      throw new UnauthorizedException('Ссылка недействительна или истекла');
    }
    return this.authService.completeAfterPrimaryFactor(found, meta);
  }
}
