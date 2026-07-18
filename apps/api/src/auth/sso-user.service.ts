import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { user } from '../db/schema';

/**
 * JIT-провижининг SSO-пользователей — общий для всех SSO-протоколов (OIDC T-016,
 * SAML T-024): юзер создаётся при первом входе, membership выдаётся инвайтом.
 * password_hash NULL = чистый SSO-аккаунт (data-model §2).
 */
@Injectable()
export class SsoUserService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async provisionUser(email: string, name: unknown) {
    const [existing] = await this.dbService.db.select().from(user).where(eq(user.email, email));
    if (existing) {
      if (existing.status === 'deactivated') {
        throw new UnauthorizedException('Аккаунт деактивирован');
      }
      // приглашённый, но ещё не принявший инвайт — SSO-вход активирует
      if (existing.status === 'invited') {
        await this.dbService.db
          .update(user)
          .set({ status: 'active' })
          .where(eq(user.id, existing.id));
      }
      return existing;
    }
    const [created] = await this.dbService.db
      .insert(user)
      .values({
        email,
        fullName: typeof name === 'string' && name ? name : email,
        passwordHash: null,
        status: 'active',
      })
      .returning();
    if (!created) throw new Error('SSO-юзер не создался');
    await this.auditLogService.record({
      action: 'user.sso_provisioned',
      entityType: 'user',
      entityId: created.id,
      after: { email: created.email },
    });
    return created;
  }
}
