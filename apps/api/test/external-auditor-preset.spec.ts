import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { membershipCategorySchema } from '@it-audit/shared';
import { DbService } from '../src/db/db.service';
import { permission, role, rolePermission } from '../src/db/schema';

/**
 * DoD T-107 (EP-AUDITOR-RELATIONSHIP): пресет-роль «External Auditor» видна как
 * системная с только view/none-уровнями (view на engagement/finding/control/report,
 * settings=none, нигде не edit); категория external_auditor валидна.
 * Интеграционный: нужна инфраструктура + миграции + `pnpm seed`.
 */
const dbService = new DbService();
let matrix: { resource: string; action: string; level: string }[] = [];

beforeAll(async () => {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const preset = roles.find((r) => r.nameI18n.en === 'External Auditor');
  if (!preset) throw new Error('Нет пресета «External Auditor» — прогнать pnpm seed');
  matrix = await dbService.db
    .select({
      resource: permission.resource,
      action: permission.action,
      level: rolePermission.level,
    })
    .from(rolePermission)
    .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
    .where(eq(rolePermission.roleId, preset.id));
});

afterAll(async () => {
  await dbService.onModuleDestroy();
});

describe('External Auditor preset (T-107)', () => {
  it('покрывает полный каталог прав (30 ячеек)', () => {
    expect(matrix.length).toBe(30);
  });

  it('settings — none, никогда не edit', () => {
    for (const cell of matrix) {
      if (cell.resource === 'settings') expect(cell.level).toBe('none');
      expect(cell.level).not.toBe('edit');
    }
  });

  it('engagement/finding/control/report — view', () => {
    const readable = matrix.filter((c) =>
      ['engagement', 'finding', 'control', 'report'].includes(c.resource),
    );
    expect(readable.length).toBeGreaterThan(0);
    for (const cell of readable) expect(cell.level).toBe('view');
  });

  it('категория external_auditor валидна, мусор — нет', () => {
    expect(membershipCategorySchema.parse('external_auditor')).toBe('external_auditor');
    expect(membershipCategorySchema.parse('auditor')).toBe('auditor');
    expect(membershipCategorySchema.safeParse('nope').success).toBe(false);
  });
});
