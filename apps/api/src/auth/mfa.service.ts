import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { toDataURL } from 'qrcode';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AuthTokenResponse, MfaEnableResponse, MfaSetupResponse } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { user } from '../db/schema';
import { AuthService, type RequestMeta } from './auth.service';

const ISSUER = 'IT Audit Platform';
const RECOVERY_CODES_COUNT = 10;

interface MfaTokenPayload {
  sub: string;
  purpose: 'mfa';
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** otplib v13 бросает TokenLengthError на не-6-значных токенах (например, recovery-кодах). */
const totpValid = (secret: string, token: string): boolean => {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return verifySync({ secret, token }).valid;
  } catch {
    return false;
  }
};

/** TOTP MFA (T-014): setup → enable (recovery-коды) → двухшаговый логин. */
@Injectable()
export class MfaService {
  constructor(
    private readonly dbService: DbService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async setup(userId: string): Promise<MfaSetupResponse> {
    const found = await this.requireUser(userId);
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: ISSUER, label: found.email, secret });
    await this.dbService.db
      .update(user)
      .set({ mfaTotpSecret: secret, mfaEnabled: false, mfaRecoveryCodes: null })
      .where(eq(user.id, userId));
    return { secret, otpauthUrl, qrDataUrl: await toDataURL(otpauthUrl) };
  }

  async enable(userId: string, code: string): Promise<MfaEnableResponse> {
    const found = await this.requireUser(userId);
    if (!found.mfaTotpSecret) throw new BadRequestException('Сначала вызовите /auth/mfa/setup');
    if (!totpValid(found.mfaTotpSecret, code)) {
      throw new BadRequestException('Код не подошёл');
    }
    const recoveryCodes = Array.from({ length: RECOVERY_CODES_COUNT }, () =>
      randomBytes(5).toString('hex'),
    );
    await this.dbService.db
      .update(user)
      .set({ mfaEnabled: true, mfaRecoveryCodes: recoveryCodes.map(sha256) })
      .where(eq(user.id, userId));
    await this.auditLogService.record({
      actorUserId: userId,
      action: 'mfa.enabled',
      entityType: 'user',
      entityId: userId,
    });
    return { recoveryCodes };
  }

  /** Второй шаг логина: TOTP-код или одноразовый recovery-код. */
  async verify(mfaToken: string, code: string, meta: RequestMeta): Promise<AuthTokenResponse> {
    let payload: MfaTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<MfaTokenPayload>(mfaToken);
    } catch {
      throw new UnauthorizedException('MFA-токен невалиден или истёк');
    }
    if (payload.purpose !== 'mfa') throw new UnauthorizedException('Это не MFA-токен');

    const found = await this.requireUser(payload.sub);
    if (!found.mfaEnabled || !found.mfaTotpSecret) {
      throw new UnauthorizedException('MFA не включена');
    }

    const totpOk = totpValid(found.mfaTotpSecret, code);
    if (!totpOk) {
      const hash = sha256(code);
      const codes = found.mfaRecoveryCodes ?? [];
      if (!codes.includes(hash)) {
        await this.auditLogService.recordAuthEvent({ userId: found.id, event: 'failed', ...meta });
        throw new UnauthorizedException('Код не подошёл');
      }
      // recovery-код одноразовый — сжигаем
      await this.dbService.db
        .update(user)
        .set({ mfaRecoveryCodes: codes.filter((c) => c !== hash) })
        .where(eq(user.id, found.id));
    }
    return this.authService.issueTokenForUser(found.id, meta);
  }

  async disable(userId: string, code: string): Promise<void> {
    const found = await this.requireUser(userId);
    if (!found.mfaEnabled || !found.mfaTotpSecret) return;
    if (!totpValid(found.mfaTotpSecret, code)) {
      throw new BadRequestException('Код не подошёл');
    }
    await this.dbService.db
      .update(user)
      .set({ mfaEnabled: false, mfaTotpSecret: null, mfaRecoveryCodes: null })
      .where(eq(user.id, userId));
    await this.auditLogService.record({
      actorUserId: userId,
      action: 'mfa.disabled',
      entityType: 'user',
      entityId: userId,
    });
  }

  private async requireUser(userId: string) {
    const [found] = await this.dbService.db.select().from(user).where(eq(user.id, userId));
    if (!found || found.status === 'deactivated') throw new UnauthorizedException();
    return found;
  }
}
