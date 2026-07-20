import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { Locale, LoginResponse } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { user } from '../db/schema';
import { EmailService } from '../email/email.service';
import { env } from '../env';
import { AuthService, type RequestMeta } from './auth.service';

interface MagicPayload {
  sub: string;
  purpose: 'magic';
}

/**
 * Magic-link (passwordless, T-V36e): аддитивный вход по одноразовой ссылке на email,
 * рядом с паролем/MFA. Токен — stateless JWT (как invite-токены), короткий срок 15 мин;
 * при погашении, если у юзера включён MFA, отдаётся тот же MFA-челлендж, что и при пароле.
 */
@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);
  /** Срок жизни magic-link токена (сек). */
  private readonly ttlSeconds = 15 * 60;

  constructor(
    private readonly dbService: DbService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Запросить ссылку. Всегда завершается без ошибки (не раскрываем существование аккаунта);
   * письмо уходит только реально существующему активному пользователю с паролем/SSO.
   */
  async request(email: string, locale: Locale | undefined, meta: RequestMeta): Promise<void> {
    void meta;
    const normalized = email.toLowerCase();
    const [found] = await this.dbService.db.select().from(user).where(eq(user.email, normalized));
    if (!found || found.status === 'deactivated') return; // молчим — без enumeration
    const token = await this.jwtService.signAsync(
      { sub: found.id, purpose: 'magic' },
      { expiresIn: this.ttlSeconds },
    );
    const magicUrl = `${env.appUrl}/login/magic?token=${token}`;
    try {
      await this.emailService.sendTemplate('magic-link', locale ?? 'en', found.email, { magicUrl });
    } catch (error) {
      // сбой почты не должен раскрывать существование аккаунта разным статусом ответа
      this.logger.warn(`magic-link email failed for ${normalized}: ${String(error)}`);
    }
  }

  /** Погасить токен → сессия (или MFA-челлендж). Невалидный/просроченный → 401. */
  async consume(token: string, meta: RequestMeta): Promise<LoginResponse> {
    let payload: MagicPayload;
    try {
      payload = await this.jwtService.verifyAsync<MagicPayload>(token);
    } catch {
      throw new UnauthorizedException('Ссылка недействительна или истекла');
    }
    if (payload.purpose !== 'magic') throw new UnauthorizedException('Неверный тип токена');
    const [found] = await this.dbService.db.select().from(user).where(eq(user.id, payload.sub));
    if (!found || found.status === 'deactivated') throw new UnauthorizedException();
    return this.authService.beginSession(found.id, found.email, found.mfaEnabled, meta);
  }
}
