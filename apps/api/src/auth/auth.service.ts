import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt } from 'drizzle-orm';
import type {
  AuthTokenResponse,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MeTenantsResponse,
  RegisterRequest,
} from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { authEvent, membership, role, tenant, user } from '../db/schema';
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

    // Пароль верен → пост-аутентификация (MFA-челлендж или сразу сессия)
    return this.beginSession(found.id, found.email, found.mfaEnabled, meta);
  }

  /**
   * Пост-аутентификация: при включённой MFA — челлендж (T-014), иначе сразу сессия.
   * Общая для парольного входа и magic-link (T-V36e) — фактор уже подтверждён вызывающим.
   */
  async beginSession(
    userId: string,
    email: string,
    mfaEnabled: boolean,
    meta: RequestMeta = {},
  ): Promise<LoginResponse> {
    if (mfaEnabled) {
      const mfaToken = await this.jwtService.signAsync(
        { sub: userId, purpose: 'mfa' },
        { expiresIn: 300 },
      );
      return { mfaRequired: true, mfaToken };
    }
    return this.completeLogin(userId, email, meta);
  }

  /** Выдать токен пользователю после полной аутентификации (пароль или пароль+MFA). */
  async issueTokenForUser(userId: string, meta: RequestMeta = {}): Promise<AuthTokenResponse> {
    const [found] = await this.dbService.db.select().from(user).where(eq(user.id, userId));
    if (!found || found.status === 'deactivated') throw new UnauthorizedException();
    return this.completeLogin(found.id, found.email, meta);
  }

  /**
   * SEC-07 (T-H01): активна ли уже другая сессия пользователя? Сессия считается
   * активной, если был `login` в окне JWT_TTL и токен ещё не истёк. Возвращает
   * число таких недавних логинов (0 = нет конкуренции).
   */
  private async recentActiveLogins(userId: string): Promise<number> {
    const since = new Date(Date.now() - env.jwtTtlSeconds * 1000);
    const rows = await this.dbService.db
      .select({ id: authEvent.id })
      .from(authEvent)
      .where(
        and(eq(authEvent.userId, userId), eq(authEvent.event, 'login'), gt(authEvent.at, since)),
      );
    return rows.length;
  }

  private async completeLogin(
    userId: string,
    email: string,
    meta: RequestMeta,
  ): Promise<AuthTokenResponse> {
    // SEC-07: детект конкурентных сессий до выдачи токена
    if ((await this.recentActiveLogins(userId)) > 0) {
      await this.auditLogService.recordAuthEvent({ userId, event: 'concurrent_session', ...meta });
      if (env.concurrentSessionPolicy === 'block') {
        throw new UnauthorizedException('Уже есть активная сессия — завершите её и повторите');
      }
    }

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

  /** Membership'ы над-тенантные (ADR-0015) — читаются без RLS-контекста. */
  async meTenants(userId: string): Promise<MeTenantsResponse> {
    const rows = await this.dbService.db
      .select({
        slug: tenant.slug,
        name: tenant.name,
        roleName: role.nameI18n,
        category: membership.category,
      })
      .from(membership)
      .innerJoin(tenant, eq(membership.tenantId, tenant.id))
      .innerJoin(role, eq(membership.roleId, role.id))
      .where(and(eq(membership.userId, userId), eq(membership.status, 'active')));
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      role: row.roleName.en,
      category: row.category,
    }));
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
