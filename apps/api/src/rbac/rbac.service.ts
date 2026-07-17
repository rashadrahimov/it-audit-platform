import { BadRequestException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PermissionDto, RoleWithMatrix } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { permission, role, rolePermission, tenant } from '../db/schema';

@Injectable()
export class RbacService {
  constructor(private readonly dbService: DbService) {}

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
