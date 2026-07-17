import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type {
  AuthTokenResponse,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterRequest,
} from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { tenant, user } from '../db/schema';
import { AuditLogService } from '../audit/audit-log.service';
import { PasswordService } from './password.service';
import { resolvePolicy, validatePassword, DEFAULT_PASSWORD_POLICY } from './password-policy';
import { env } from '../env';

export interface JwtPayload {
  sub: string;
  email: string;
}

/** IP и user-agent запроса — для журнала входов (LOG-04). */
export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dbService: DbService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async register(request: RegisterRequest): Promise<MeResponse> {
    const policy = request.tenantSlug
      ? resolvePolicy(await this.tenantSettings(request.tenantSlug))
      : DEFAULT_PASSWORD_POLICY;
    const issues = validatePassword(request.password, policy);
    if (issues.length > 0) throw new BadRequestException(issues);

    const passwordHash = await this.passwordService.hash(request.password);
    try {
      const [created] = await this.dbService.db
        .insert(user)
        .values({
          email: request.email.toLowerCase(),
          passwordHash,
          fullName: request.fullName,
          locale: request.locale ?? 'en',
          passwordChangedAt: new Date(),
        })
        .returning();
      if (!created) throw new Error('insert returned nothing');
      return this.toMe(created);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
      throw error;
    }
  }

  async login(request: LoginRequest, meta: RequestMeta = {}): Promise<LoginResponse> {
    const [found] = await this.dbService.db
      .select()
      .from(user)
      .where(eq(user.email, request.email.toLowerCase()));
    // Единый ответ для «нет такого» и «пароль неверен» — не раскрываем существование аккаунта
    if (!found || !found.passwordHash || found.status === 'deactivated') {
      await this.auditLogService.recordAuthEvent({ userId: found?.id, event: 'failed', ...meta });
      throw new UnauthorizedException('Неверный email или пароль');
    }
    if (found.lockedUntil && found.lockedUntil > new Date()) {
      await this.auditLogService.recordAuthEvent({ userId: found.id, event: 'locked', ...meta });
      throw new UnauthorizedException('Аккаунт временно заблокирован — попробуйте позже');
    }

    const ok = await this.passwordService.verify(request.password, found.passwordHash);
    if (!ok) {
      await this.registerFailedAttempt(found.id, found.failedLoginCount);
      await this.auditLogService.recordAuthEvent({ userId: found.id, event: 'failed', ...meta });
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // Пароль верен; при включённой MFA — второй шаг (T-014)
    if (found.mfaEnabled) {
      const mfaToken = await this.jwtService.signAsync(
        { sub: found.id, purpose: 'mfa' },
        { expiresIn: 300 },
      );
      return { mfaRequired: true, mfaToken };
    }
    return this.completeLogin(found.id, found.email, meta);
  }

  /** Выдать токен пользователю после полной аутентификации (пароль или пароль+MFA). */
  async issueTokenForUser(userId: string, meta: RequestMeta = {}): Promise<AuthTokenResponse> {
    const [found] = await this.dbService.db.select().from(user).where(eq(user.id, userId));
    if (!found || found.status === 'deactivated') throw new UnauthorizedException();
    return this.completeLogin(found.id, found.email, meta);
  }

  private async completeLogin(
    userId: string,
    email: string,
    meta: RequestMeta,
  ): Promise<AuthTokenResponse> {
    await this.dbService.db
      .update(user)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(user.id, userId));
    await this.auditLogService.recordAuthEvent({ userId, event: 'login', ...meta });

    const payload: JwtPayload = { sub: userId, email };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresInSeconds: env.jwtTtlSeconds,
    };
  }

  async changePassword(userId: string, request: ChangePasswordRequest): Promise<void> {
    const [found] = await this.dbService.db.select().from(user).where(eq(user.id, userId));
    if (!found?.passwordHash) throw new UnauthorizedException();
    const ok = await this.passwordService.verify(request.currentPassword, found.passwordHash);
    if (!ok) throw new UnauthorizedException('Текущий пароль неверен');

    const issues = validatePassword(request.newPassword, DEFAULT_PASSWORD_POLICY);
    if (issues.length > 0) throw new BadRequestException(issues);

    await this.dbService.db
      .update(user)
      .set({
        passwordHash: await this.passwordService.hash(request.newPassword),
        passwordChangedAt: new Date(),
      })
      .where(eq(user.id, userId));
  }

  async me(userId: string): Promise<MeResponse> {
    const [found] = await this.dbService.db.select().from(user).where(eq(user.id, userId));
    if (!found) throw new UnauthorizedException();
    return this.toMe(found);
  }

  private async registerFailedAttempt(userId: string, currentCount: number): Promise<void> {
    const policy = DEFAULT_PASSWORD_POLICY;
    const failedLoginCount = currentCount + 1;
    const lockedUntil =
      failedLoginCount >= policy.lockoutThreshold
        ? new Date(Date.now() + policy.lockoutMinutes * 60_000)
        : null;
    await this.dbService.db
      .update(user)
      .set({ failedLoginCount, lockedUntil })
      .where(eq(user.id, userId));
  }

  private async tenantSettings(slug: string): Promise<unknown> {
    const [found] = await this.dbService.db.select().from(tenant).where(eq(tenant.slug, slug));
    if (!found) throw new BadRequestException(`Тенант «${slug}» не найден`);
    return found.settings;
  }

  private toMe(u: typeof user.$inferSelect): MeResponse {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      locale: (u.locale as MeResponse['locale']) ?? 'en',
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    return cause?.code === '23505' || (error as { code?: string }).code === '23505';
  }
}
