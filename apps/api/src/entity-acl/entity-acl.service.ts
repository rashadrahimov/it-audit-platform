import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { entityAcl, membership, permission, rolePermission, user } from '../db/schema';
import { resolveEntityAccess, type AccessResult, type AclGrant } from './entity-acl.access';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Сущности, поддерживающие per-entity ACL (T-V48, T-V56 +control). Расширяемо по мере раскатки. */
export const ACL_ENTITY_TYPES = ['risk', 'control'] as const;
export type AclEntityType = (typeof ACL_ENTITY_TYPES)[number];

/**
 * T-V48 (ADR-0021): управление per-entity ACL «Manage access» + резолвер доступа.
 * Гранты полиморфны (entity_type + entity_id). Семантика в entity-acl.access.
 */
@Injectable()
export class EntityAclService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** membershipId текущего пользователя + признак админа (роль даёт settings/edit=edit). */
  async resolveActor(
    tenantId: string,
    userId: string,
  ): Promise<{ membershipId: string | null; isAdmin: boolean }> {
    const [me] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: membership.id, roleId: membership.roleId })
        .from(membership)
        .where(and(eq(membership.userId, userId), eq(membership.tenantId, tenantId))),
    );
    if (!me) return { membershipId: null, isAdmin: false };
    const admin = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ level: rolePermission.level })
        .from(rolePermission)
        .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
        .where(
          and(
            eq(rolePermission.roleId, me.roleId),
            eq(permission.resource, 'settings'),
            eq(permission.action, 'edit'),
            eq(rolePermission.level, 'edit'),
          ),
        ),
    );
    return { membershipId: me.id, isAdmin: admin.length > 0 };
  }

  private async grantsFor(tenantId: string, entityType: string, entityIds: string[]) {
    if (entityIds.length === 0) return [] as Array<typeof entityAcl.$inferSelect>;
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(entityAcl)
        .where(and(eq(entityAcl.entityType, entityType), inArray(entityAcl.entityId, entityIds))),
    );
  }

  /** Доступ к одной сущности (view/edit) с учётом ACL + владельца + админа. */
  async access(
    ctx: { tenantId: string; membershipId: string | null; isAdmin: boolean },
    entityType: string,
    entityId: string,
    ownerMembershipId: string | null,
  ): Promise<AccessResult> {
    const rows = await this.grantsFor(ctx.tenantId, entityType, [entityId]);
    const grants: AclGrant[] = rows.map((r) => ({ membershipId: r.membershipId, level: r.level }));
    return resolveEntityAccess(grants, ctx.membershipId, ownerMembershipId, ctx.isAdmin);
  }

  /** Оставить из списка только видимые (для фильтра list-эндпоинтов). */
  async filterVisible(
    ctx: { tenantId: string; membershipId: string | null; isAdmin: boolean },
    entityType: string,
    items: Array<{ id: string; ownerMembershipId: string | null }>,
  ): Promise<Set<string>> {
    const rows = await this.grantsFor(
      ctx.tenantId,
      entityType,
      items.map((i) => i.id),
    );
    const byEntity = new Map<string, AclGrant[]>();
    for (const r of rows) {
      const arr = byEntity.get(r.entityId) ?? [];
      arr.push({ membershipId: r.membershipId, level: r.level });
      byEntity.set(r.entityId, arr);
    }
    const visible = new Set<string>();
    for (const item of items) {
      const res = resolveEntityAccess(
        byEntity.get(item.id) ?? [],
        ctx.membershipId,
        item.ownerMembershipId,
        ctx.isAdmin,
      );
      if (res.canView) visible.add(item.id);
    }
    return visible;
  }

  /** Гранты сущности (для панели «Manage access»): с именем/почтой участника. */
  async listFor(tenantId: string, entityType: string, entityId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: entityAcl.id,
          membershipId: entityAcl.membershipId,
          level: entityAcl.level,
          fullName: user.fullName,
          email: user.email,
        })
        .from(entityAcl)
        .innerJoin(membership, eq(membership.id, entityAcl.membershipId))
        .innerJoin(user, eq(user.id, membership.userId))
        .where(and(eq(entityAcl.entityType, entityType), eq(entityAcl.entityId, entityId))),
    );
    return rows;
  }

  async grant(
    actor: Actor,
    input: { entityType: string; entityId: string; membershipId: string; level?: string },
  ) {
    if (!ACL_ENTITY_TYPES.includes(input.entityType as AclEntityType)) {
      throw new BadRequestException(`ACL не поддержан для «${input.entityType}»`);
    }
    const level = input.level === 'edit' ? 'edit' : 'view';
    const row = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [ins] = await tx
        .insert(entityAcl)
        .values({
          tenantId: actor.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          membershipId: input.membershipId,
          level,
        })
        .onConflictDoUpdate({
          target: [entityAcl.entityType, entityAcl.entityId, entityAcl.membershipId],
          set: { level },
        })
        .returning();
      return ins;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'entity_acl.granted',
      entityType: input.entityType,
      entityId: input.entityId,
      after: { membershipId: input.membershipId, level },
    });
    return row;
  }

  async revoke(actor: Actor, id: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx.delete(entityAcl).where(eq(entityAcl.id, id)).returning();
      return row;
    });
    if (!removed) throw new NotFoundException(`ACL-грант ${id} не найден`);
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'entity_acl.revoked',
      entityType: removed.entityType,
      entityId: removed.entityId,
      before: { membershipId: removed.membershipId, level: removed.level },
    });
  }
}
