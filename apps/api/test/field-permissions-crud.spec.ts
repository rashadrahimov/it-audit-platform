import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { BadRequestException } from '@nestjs/common';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { FieldPermissionsService } from '../src/field-permissions/field-permissions.service';
import { fieldPermission, role, tenant } from '../src/db/schema';

/**
 * DoD SEC-04 (T-H07): CRUD field-level прав тенанта. Глобальные пресеты — не через API.
 * Интеграционный: нужна БД + `pnpm seed` (для глобальной роли).
 */
const run = Date.now();
const slug = `fp-crud-${run}`;
const dbService = new DbService();
const service = new FieldPermissionsService(dbService, new AuditLogService(dbService));

let tenantId: string;
let tenantRoleId: string;
let globalRoleId: string;
const actor = () => ({ tenantId, userId: tenantId, ip: '::1' });

beforeAll(async () => {
  const [t] = await dbService.db.insert(tenant).values({ slug, name: 'FP CRUD' }).returning();
  tenantId = t!.id;
  const [r] = await dbService.withTenant(tenantId, (tx) =>
    tx
      .insert(role)
      .values({ tenantId, nameI18n: { en: 'FP Role', az: 'FP', ru: 'FP' } })
      .returning(),
  );
  tenantRoleId = r!.id;
  const [g] = await dbService.db.select().from(role).where(eq(role.isSystem, true)).limit(1);
  globalRoleId = g!.id;
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(fieldPermission).where(eq(fieldPermission.roleId, tenantRoleId));
    await tx.delete(role).where(eq(role.id, tenantRoleId));
  });
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('FieldPermissionsService CRUD (SEC-04)', () => {
  let createdId: string;

  it('upsert для роли тенанта — создаёт', async () => {
    const { id } = await service.upsert(actor(), {
      roleId: tenantRoleId,
      entityType: 'finding',
      field: 'riskRating',
      level: 'view',
    });
    createdId = id;
    const list = await service.list(tenantId, tenantRoleId);
    expect(list).toHaveLength(1);
    expect(list[0]!.level).toBe('view');
  });

  it('повторный upsert того же поля — обновляет level, не дублирует', async () => {
    await service.upsert(actor(), {
      roleId: tenantRoleId,
      entityType: 'finding',
      field: 'riskRating',
      level: 'hidden',
    });
    const list = await service.list(tenantId, tenantRoleId);
    expect(list).toHaveLength(1);
    expect(list[0]!.level).toBe('hidden');
  });

  it('upsert для глобальной пресет-роли → 400', async () => {
    await expect(
      service.upsert(actor(), {
        roleId: globalRoleId,
        entityType: 'finding',
        field: 'x',
        level: 'hidden',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove — удаляет', async () => {
    await service.remove(actor(), createdId);
    const list = await service.list(tenantId, tenantRoleId);
    expect(list).toHaveLength(0);
  });
});
