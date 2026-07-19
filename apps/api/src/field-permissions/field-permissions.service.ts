import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { fieldPermission, role } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface UpsertFieldPermission {
  roleId: string;
  entityType: string;
  field: string;
  level: 'hidden' | 'view' | 'edit';
}

/**
 * Управление field-level правами тенанта (SEC-04, T-H07, ADR-0020). RLS-политика
 * записи пускает app только к ролям своего тенанта — глобальные пресеты настраивает seed.
 */
@Injectable()
export class FieldPermissionsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(tenantId: string, roleId?: string) {
    return this.dbService.withTenant(tenantId, (tx) => {
      const base = tx
        .select({
          id: fieldPermission.id,
          roleId: fieldPermission.roleId,
          entityType: fieldPermission.entityType,
          field: fieldPermission.field,
          level: fieldPermission.level,
        })
        .from(fieldPermission);
      return roleId ? base.where(eq(fieldPermission.roleId, roleId)) : base;
    });
  }

  async upsert(actor: Actor, input: UpsertFieldPermission) {
    const row = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      // роль должна принадлежать тенанту (RLS write и так не пустит к глобальным, но дадим 400)
      const [r] = await tx
        .select({ id: role.id })
        .from(role)
        .where(and(eq(role.id, input.roleId), eq(role.tenantId, actor.tenantId)));
      if (!r) throw new BadRequestException('roleId: роль не принадлежит тенанту');
      const [saved] = await tx
        .insert(fieldPermission)
        .values(input)
        .onConflictDoUpdate({
          target: [fieldPermission.roleId, fieldPermission.entityType, fieldPermission.field],
          set: { level: input.level },
        })
        .returning({ id: fieldPermission.id });
      if (!saved) throw new Error('field_permission не сохранился');
      return saved;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'field_permission.upserted',
      entityType: 'field_permission',
      entityId: row.id,
      after: { entity: input.entityType, field: input.field, level: input.level },
    });
    return { id: row.id };
  }

  async remove(actor: Actor, id: string) {
    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx.delete(fieldPermission).where(eq(fieldPermission.id, id)),
    );
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'field_permission.removed',
      entityType: 'field_permission',
      entityId: id,
    });
    return { id };
  }
}
