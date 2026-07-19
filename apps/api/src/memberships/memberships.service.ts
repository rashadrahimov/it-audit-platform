import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { membership, role, user } from '../db/schema';

/**
 * Список участников тенанта (T-A23, SCH-02). membership — control-plane таблица
 * без RLS, поэтому фильтруем по tenantId явно (как notifications/access-reviews).
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** T-V05: смена роли участника (LOG-05 — выдача прав пишется в журнал). */
  async changeRole(
    actor: { tenantId: string; userId: string; ip?: string },
    membershipId: string,
    roleId: string,
  ) {
    const [m] = await this.dbService.db
      .select()
      .from(membership)
      .where(and(eq(membership.id, membershipId), eq(membership.tenantId, actor.tenantId)));
    if (!m) throw new NotFoundException(`Membership ${membershipId} не найден`);
    // роль — глобальный пресет ИЛИ роль этого тенанта; читаем под withTenant,
    // иначе RLS скроет тенантские роли (без контекста видны только глобальные)
    const [r] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(role)
        .where(
          and(eq(role.id, roleId), or(isNull(role.tenantId), eq(role.tenantId, actor.tenantId))),
        ),
    );
    if (!r) throw new BadRequestException('roleId: роль недоступна тенанту');
    await this.dbService.db
      .update(membership)
      .set({ roleId })
      .where(eq(membership.id, membershipId));
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'membership.role_changed',
      entityType: 'membership',
      entityId: membershipId,
      before: { roleId: m.roleId },
      after: { roleId },
    });
    return { id: membershipId, roleId };
  }

  async list(tenantId: string, locale: Locale) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: membership.id,
          userId: membership.userId,
          fullName: user.fullName,
          email: user.email,
          category: membership.category,
          status: membership.status,
          roleName: role.nameI18n,
        })
        .from(membership)
        .innerJoin(user, eq(membership.userId, user.id))
        .innerJoin(role, eq(membership.roleId, role.id))
        .where(eq(membership.tenantId, tenantId))
        .orderBy(asc(user.fullName)),
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      category: r.category,
      status: r.status,
      role: resolveLocalized(r.roleName, locale),
    }));
  }
}
