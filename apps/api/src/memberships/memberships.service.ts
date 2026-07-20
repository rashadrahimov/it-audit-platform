import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { membership, permission, role, rolePermission, subsidiary, user } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string | null;
}

/**
 * Управление участниками тенанта (T-A23 список; T-109 выдача/отзыв доступа).
 * membership — над-тенантная control-plane таблица без RLS, поэтому фильтруем
 * по tenantId явно (как notifications/access-reviews).
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
          subsidiaryScope: membership.subsidiaryScope,
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
      subsidiaryScope: r.subsidiaryScope,
      role: resolveLocalized(r.roleName, locale),
    }));
  }

  /** T-109/T-110: сменить роль, scoped-доступ и/или окно доступа участника (grant access). */
  async update(
    actor: Actor,
    membershipId: string,
    input: {
      roleId?: string;
      subsidiaryScope?: string[] | null;
      dataAccessFrom?: Date | null;
      dataAccessUntil?: Date | null;
    },
  ) {
    const m = await this.load(actor.tenantId, membershipId);

    let roleId = m.roleId;
    if (input.roleId && input.roleId !== m.roleId) {
      if (!(await this.roleAvailable(actor.tenantId, input.roleId))) {
        throw new BadRequestException('roleId: роль не найдена в тенанте');
      }
      // понижение последнего администратора недопустимо
      if (
        (await this.isAdminRole(actor.tenantId, m.roleId)) &&
        !(await this.isAdminRole(actor.tenantId, input.roleId))
      ) {
        await this.assertNotLastAdmin(actor.tenantId, membershipId);
      }
      roleId = input.roleId;
    }

    let subsidiaryScope = m.subsidiaryScope;
    if (input.subsidiaryScope !== undefined) {
      subsidiaryScope = input.subsidiaryScope;
      await this.assertScopeSubsidiaries(actor.tenantId, subsidiaryScope);
    }

    // T-110: окно доступа (NULL-граница = бессрочно с этой стороны).
    const dataAccessFrom =
      input.dataAccessFrom !== undefined ? input.dataAccessFrom : m.dataAccessFrom;
    const dataAccessUntil =
      input.dataAccessUntil !== undefined ? input.dataAccessUntil : m.dataAccessUntil;
    if (dataAccessFrom && dataAccessUntil && dataAccessFrom > dataAccessUntil) {
      throw new BadRequestException('dataAccessFrom позже dataAccessUntil');
    }

    await this.dbService.db
      .update(membership)
      .set({ roleId, subsidiaryScope, dataAccessFrom, dataAccessUntil })
      .where(eq(membership.id, membershipId));

    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'membership.updated',
      entityType: 'membership',
      entityId: membershipId,
      before: {
        roleId: m.roleId,
        subsidiaryScope: m.subsidiaryScope,
        dataAccessFrom: m.dataAccessFrom,
        dataAccessUntil: m.dataAccessUntil,
      },
      after: { roleId, subsidiaryScope, dataAccessFrom, dataAccessUntil },
    });
    return { id: membershipId, roleId, subsidiaryScope, dataAccessFrom, dataAccessUntil };
  }

  /** T-109: отозвать доступ (soft — status=revoked; resolveAccess пускает только active). */
  async revoke(actor: Actor, membershipId: string) {
    const m = await this.load(actor.tenantId, membershipId);
    if (m.status === 'revoked') return { id: membershipId, status: 'revoked' as const };
    if (await this.isAdminRole(actor.tenantId, m.roleId)) {
      await this.assertNotLastAdmin(actor.tenantId, membershipId);
    }
    await this.dbService.db
      .update(membership)
      .set({ status: 'revoked' })
      .where(eq(membership.id, membershipId));
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'membership.revoked',
      entityType: 'membership',
      entityId: membershipId,
      before: { status: m.status },
      after: { status: 'revoked' },
    });
    return { id: membershipId, status: 'revoked' as const };
  }

  private async load(tenantId: string, membershipId: string) {
    const [m] = await this.dbService.db
      .select()
      .from(membership)
      .where(and(eq(membership.id, membershipId), eq(membership.tenantId, tenantId)));
    if (!m) throw new NotFoundException('Membership не найден в тенанте');
    return m;
  }

  /** Роль доступна тенанту: системный пресет (tenant_id NULL) или роль этого тенанта. */
  private async roleAvailable(tenantId: string, roleId: string): Promise<boolean> {
    const [r] = await this.dbService.db
      .select({ tenantId: role.tenantId })
      .from(role)
      .where(eq(role.id, roleId));
    return !!r && (r.tenantId === null || r.tenantId === tenantId);
  }

  /** Роль «административная» = даёт settings.edit=edit (может управлять тенантом). */
  private async isAdminRole(tenantId: string, roleId: string): Promise<boolean> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [cell] = await tx
        .select({ level: rolePermission.level })
        .from(rolePermission)
        .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
        .where(
          and(
            eq(rolePermission.roleId, roleId),
            eq(permission.resource, 'settings'),
            eq(permission.action, 'edit'),
          ),
        );
      return cell?.level === 'edit';
    });
  }

  /** Нельзя оставить тенант без единственного активного администратора. */
  private async assertNotLastAdmin(tenantId: string, excludeMembershipId: string): Promise<void> {
    const others = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: membership.id })
        .from(membership)
        .innerJoin(rolePermission, eq(rolePermission.roleId, membership.roleId))
        .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
        .where(
          and(
            eq(membership.tenantId, tenantId),
            eq(membership.status, 'active'),
            ne(membership.id, excludeMembershipId),
            eq(permission.resource, 'settings'),
            eq(permission.action, 'edit'),
            eq(rolePermission.level, 'edit'),
          ),
        ),
    );
    if (others.length === 0) {
      throw new BadRequestException('Нельзя снять/понизить последнего администратора тенанта');
    }
  }

  /** scope — только реальные (не удалённые) дочки тенанта (как в invites T-108). */
  private async assertScopeSubsidiaries(tenantId: string, scope: string[] | null): Promise<void> {
    if (!scope || scope.length === 0) return;
    const found = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: subsidiary.id })
        .from(subsidiary)
        .where(and(inArray(subsidiary.id, scope), isNull(subsidiary.deletedAt))),
    );
    if (found.length !== new Set(scope).size) {
      throw new BadRequestException('subsidiaryScope содержит неизвестные дочки тенанта');
    }
  }
}
