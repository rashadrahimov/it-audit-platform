import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { I18nText, PermissionDto, PermissionLevel, RoleWithMatrix } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  fieldPermission,
  membership,
  permission,
  role,
  rolePermission,
  tenant,
} from '../db/schema';
import type { RequiredPermission } from './require-permission.decorator';
import type { FieldLevel, FieldLevels } from './field-policy';

export interface AccessResolution {
  allowed: boolean;
  level: PermissionLevel;
  tenantId: string;
}

@Injectable()
export class RbacService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** T-V05: кастомная роль тенанта (пресеты — read-only, is_system=false). */
  async createRole(actor: { tenantId: string; userId: string; ip?: string }, nameI18n: I18nText) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(role)
        .values({ tenantId: actor.tenantId, nameI18n, isSystem: false })
        .returning();
      if (!row) throw new Error('Роль не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'role.created',
      entityType: 'role',
      entityId: created.id,
      after: { name: nameI18n.en },
    });
    return { id: created.id, nameI18n: created.nameI18n };
  }

  /** T-V05: правка ячейки матрицы кастомной роли (глобальные пресеты защищены). */
  async setCell(
    actor: { tenantId: string; userId: string; ip?: string },
    roleId: string,
    resource: string,
    action: string,
    level: 'none' | 'view' | 'edit',
  ) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [r] = await tx.select().from(role).where(eq(role.id, roleId));
      if (!r) throw new NotFoundException(`Роль ${roleId} не найдена`);
      if (r.tenantId !== actor.tenantId || r.isSystem) {
        throw new BadRequestException('Менять можно только кастомные роли тенанта');
      }
      const [perm] = await tx
        .select()
        .from(permission)
        .where(and(eq(permission.resource, resource), eq(permission.action, action)));
      if (!perm) throw new BadRequestException(`Право ${resource}/${action} не существует`);
      await tx
        .insert(rolePermission)
        .values({ roleId, permissionId: perm.id, level })
        .onConflictDoUpdate({
          target: [rolePermission.roleId, rolePermission.permissionId],
          set: { level },
        });
      return { permissionId: perm.id };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'role.cell_set',
      entityType: 'role',
      entityId: roleId,
      after: { resource, action, level, permissionId: result.permissionId },
    });
    return { roleId, resource, action, level };
  }

  /**
   * Уровень доступа пользователя к (resource, action) в тенанте.
   * Membership читается без RLS-контекста (над-тенантная связка), матрица —
   * внутри withTenant: иначе RLS скроет ячейки тенантских ролей.
   */
  async resolveAccess(
    userId: string,
    tenantSlug: string,
    required: RequiredPermission,
  ): Promise<AccessResolution> {
    const [foundTenant] = await this.dbService.db
      .select()
      .from(tenant)
      .where(eq(tenant.slug, tenantSlug));
    if (!foundTenant) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);

    const [member] = await this.dbService.db
      .select()
      .from(membership)
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.tenantId, foundTenant.id),
          eq(membership.status, 'active'),
        ),
      );
    if (!member) return { allowed: false, level: 'none', tenantId: foundTenant.id };

    // T-110: доступ вне окна data-access закрыт (time-boxed доступ внешнего аудитора).
    const now = new Date();
    if (
      (member.dataAccessFrom && now < member.dataAccessFrom) ||
      (member.dataAccessUntil && now > member.dataAccessUntil)
    ) {
      return { allowed: false, level: 'none', tenantId: foundTenant.id };
    }

    const level = await this.dbService.withTenant(foundTenant.id, async (tx) => {
      const [cell] = await tx
        .select({ level: rolePermission.level })
        .from(rolePermission)
        .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
        .where(
          and(
            eq(rolePermission.roleId, member.roleId),
            eq(permission.resource, required.resource),
            eq(permission.action, required.action),
          ),
        );
      return (cell?.level ?? 'none') as PermissionLevel;
    });

    const allowed =
      required.level === 'view' ? level === 'view' || level === 'edit' : level === 'edit';
    return { allowed, level, tenantId: foundTenant.id };
  }

  /**
   * Field-level уровни роли пользователя для сущности (SEC-04, ADR-0020).
   * Пусто = нет оверлея (поля наследуют entity-level право). tenantId — из guard'а.
   */
  async fieldLevels(userId: string, tenantId: string, entityType: string): Promise<FieldLevels> {
    const [member] = await this.dbService.db
      .select({ roleId: membership.roleId })
      .from(membership)
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.tenantId, tenantId),
          eq(membership.status, 'active'),
        ),
      );
    if (!member) return {};
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ field: fieldPermission.field, level: fieldPermission.level })
        .from(fieldPermission)
        .where(
          and(
            eq(fieldPermission.roleId, member.roleId),
            eq(fieldPermission.entityType, entityType),
          ),
        ),
    );
    return Object.fromEntries(rows.map((r) => [r.field, r.level as FieldLevel]));
  }

  async permissions(): Promise<PermissionDto[]> {
    const rows = await this.dbService.db.select().from(permission);
    return rows.map((p) => ({ id: p.id, resource: p.resource, action: p.action }));
  }

  /**
   * Роли с матрицей: глобальные пресеты + роли тенанта (если задан slug).
   * Тенант из query — временно: после T-020 контекст возьмётся из membership.
   */
  async roles(tenantSlug?: string): Promise<RoleWithMatrix[]> {
    if (!tenantSlug) return this.collectRoles(this.dbService.db);
    const [found] = await this.dbService.db
      .select()
      .from(tenant)
      .where(eq(tenant.slug, tenantSlug));
    if (!found) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);
    return this.dbService.withTenant(found.id, (tx) => this.collectRoles(tx));
  }

  private async collectRoles(
    db: Pick<typeof this.dbService.db, 'select'>,
  ): Promise<RoleWithMatrix[]> {
    const roles = await db.select().from(role);
    const cells = await db
      .select({
        roleId: rolePermission.roleId,
        level: rolePermission.level,
        resource: permission.resource,
        action: permission.action,
      })
      .from(rolePermission)
      .innerJoin(permission, eq(rolePermission.permissionId, permission.id));
    return roles.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      nameI18n: r.nameI18n,
      isSystem: r.isSystem,
      matrix: cells
        .filter((c) => c.roleId === r.id)
        .map((c) => ({
          resource: c.resource,
          action: c.action,
          level: c.level as RoleWithMatrix['matrix'][number]['level'],
        })),
    }));
  }
}
