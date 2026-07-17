import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import type { Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { PasswordService } from '../auth/password.service';
import { DEFAULT_PASSWORD_POLICY, validatePassword } from '../auth/password-policy';
import { DbService } from '../db/db.service';
import { membership, tenant, user } from '../db/schema';
import { EmailService } from '../email/email.service';
import { LicenseService } from '../license/license.service';
import { env } from '../env';

interface InviteTokenPayload {
  sub: string;
  tenantId: string;
  purpose: 'invite';
}

export interface InviteInput {
  email: string;
  roleId: string;
  isAuditSeat: boolean;
  locale: Locale;
}

export interface InviteActor {
  userId: string;
  ip?: string | null;
}

/** Invite-flow (T-015): инвайт по email → подтверждение по токену → аккаунт активен. */
@Injectable()
export class InvitesService {
  constructor(
    private readonly dbService: DbService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly licenseService: LicenseService,
    private readonly auditLogService: AuditLogService,
    private readonly passwordService: PasswordService,
  ) {}

  async invite(tenantId: string, input: InviteInput, actor: InviteActor) {
    const email = input.email.toLowerCase();
    const [foundTenant] = await this.dbService.db
      .select()
      .from(tenant)
      .where(eq(tenant.id, tenantId));
    if (!foundTenant) throw new BadRequestException('Тенант не найден');

    // Юзер мог существовать (другой тенант) — тогда только membership
    await this.dbService.db
      .insert(user)
      .values({ email, fullName: email, status: 'invited' })
      .onConflictDoNothing({ target: user.email });
    const [invited] = await this.dbService.db.select().from(user).where(eq(user.email, email));
    if (!invited) throw new Error('Пользователь не создался');

    const inserted = await this.dbService.db
      .insert(membership)
      .values({
        userId: invited.id,
        tenantId,
        roleId: input.roleId,
        isAuditSeat: input.isAuditSeat,
        invitedBy: actor.userId,
        status: 'invited',
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      throw new ConflictException('У пользователя уже есть membership в этом тенанте');
    }

    const token = await this.jwtService.signAsync(
      { sub: invited.id, tenantId, purpose: 'invite' } satisfies InviteTokenPayload,
      { expiresIn: '7d' },
    );
    const inviteUrl = `${env.appUrl}/invite/accept?token=${token}`;
    await this.emailService.sendTemplate('invite', input.locale, email, {
      inviteUrl,
      tenantName: foundTenant.name,
    });

    // LOG-05: кто/кому/когда дал права
    await this.auditLogService.record({
      tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'membership.granted',
      entityType: 'membership',
      entityId: inserted[0]?.id,
      after: { userId: invited.id, roleId: input.roleId, isAuditSeat: input.isAuditSeat },
    });

    return { userId: invited.id, warnings: await this.licenseService.quotaWarnings(tenantId) };
  }

  async accept(token: string, password: string, fullName?: string): Promise<void> {
    let payload: InviteTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<InviteTokenPayload>(token);
    } catch {
      throw new BadRequestException('Инвайт-токен невалиден или истёк');
    }
    if (payload.purpose !== 'invite') throw new BadRequestException('Это не инвайт-токен');

    const issues = validatePassword(password, DEFAULT_PASSWORD_POLICY);
    if (issues.length > 0) throw new BadRequestException(issues);

    const [invited] = await this.dbService.db.select().from(user).where(eq(user.id, payload.sub));
    if (!invited) throw new BadRequestException('Пользователь приглашения не найден');

    await this.dbService.db
      .update(user)
      .set({
        passwordHash: await this.passwordService.hash(password),
        passwordChangedAt: new Date(),
        status: 'active',
        ...(fullName ? { fullName } : {}),
      })
      .where(eq(user.id, payload.sub));
    await this.dbService.db
      .update(membership)
      .set({ status: 'active' })
      .where(and(eq(membership.userId, payload.sub), eq(membership.tenantId, payload.tenantId)));

    await this.auditLogService.record({
      tenantId: payload.tenantId,
      actorUserId: payload.sub,
      action: 'invite.accepted',
      entityType: 'membership',
      entityId: null,
    });
  }
}
