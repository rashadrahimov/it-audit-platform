import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { EngagementsService } from '../src/engagements/engagements.service';
import { assertSubsidiaryInAuditorScope, resolveAuditorScope } from '../src/rbac/auditor-scope';
import { engagement, membership, role, subsidiary, tenant, user } from '../src/db/schema';

/**
 * DoD T-111 (EP-AUDITOR-RELATIONSHIP): внешний аудитор (category=external_auditor)
 * со scope видит engagement'ы только доверенных дочек; полный скоуп (null) — все;
 * пустой scope [] — ни одной. Внутренние роли не режутся. Интеграционный: нужны
 * инфраструктура + миграции + `pnpm seed` (пресет External Auditor).
 */
const run = Date.now();
const slug = `auditor-scope-${run}`;
const emails = [
  `ext-scoped-${run}@firm.io`,
  `ext-full-${run}@firm.io`,
  `int-admin-${run}@firm.io`,
  `ext-empty-${run}@firm.io`,
];

const dbService = new DbService();
const engagementsService = new EngagementsService(dbService, new AuditLogService(dbService));

let tenantId: string;
let scopedId: string; // external_auditor scope=[A]
let fullId: string; // external_auditor scope=null
let adminId: string; // внутренний Admin
let emptyId: string; // external_auditor scope=[]
let subAId: string;
let subBId: string;
let engAId: string; // engagement в дочке A
let engBId: string; // engagement в дочке B

async function presetRoleId(nameEn: string): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const found = roles.find((r) => r.nameI18n.en === nameEn);
  if (!found) throw new Error(`Нет пресета ${nameEn} — прогнать pnpm seed`);
  return found.id;
}

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug, name: 'Auditor Scope T' })
    .returning();
  tenantId = t!.id;
  const users = await dbService.db
    .insert(user)
    .values(emails.map((email) => ({ email, fullName: email, passwordHash: 'x' })))
    .returning();
  scopedId = users[0]!.id;
  fullId = users[1]!.id;
  adminId = users[2]!.id;
  emptyId = users[3]!.id;

  await dbService.withTenant(tenantId, async (tx) => {
    const [a] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'Sub A' }, code: 'A' })
      .returning();
    const [b] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'Sub B' }, code: 'B' })
      .returning();
    subAId = a!.id;
    subBId = b!.id;
    const engs = await tx
      .insert(engagement)
      .values([
        { tenantId, subsidiaryId: subAId, titleI18n: { en: 'Audit A' } },
        { tenantId, subsidiaryId: subBId, titleI18n: { en: 'Audit B' } },
      ])
      .returning();
    engAId = engs[0]!.id;
    engBId = engs[1]!.id;
  });

  const extRole = await presetRoleId('External Auditor');
  const adminRole = await presetRoleId('Admin');
  await dbService.db.insert(membership).values([
    {
      userId: scopedId,
      tenantId,
      roleId: extRole,
      category: 'external_auditor',
      subsidiaryScope: [subAId],
    },
    {
      userId: fullId,
      tenantId,
      roleId: extRole,
      category: 'external_auditor',
      subsidiaryScope: null,
    },
    {
      userId: adminId,
      tenantId,
      roleId: adminRole,
      category: 'auditor',
      subsidiaryScope: [subAId],
    },
    {
      userId: emptyId,
      tenantId,
      roleId: extRole,
      category: 'external_auditor',
      subsidiaryScope: [],
    },
  ]);
});

afterAll(async () => {
  await dbService.withTenant(tenantId, (tx) =>
    tx.delete(engagement).where(eq(engagement.tenantId, tenantId)),
  );
  await dbService.withTenant(tenantId, (tx) =>
    tx.delete(subsidiary).where(eq(subsidiary.tenantId, tenantId)),
  );
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  for (const email of emails) await dbService.db.delete(user).where(eq(user.email, email));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('resolveAuditorScope helper (T-111)', () => {
  it('external_auditor со scope → массив дочек', async () => {
    expect(await resolveAuditorScope(dbService, tenantId, scopedId)).toEqual([subAId]);
  });
  it('external_auditor с null-scope → null (вся группа)', async () => {
    expect(await resolveAuditorScope(dbService, tenantId, fullId)).toBeNull();
  });
  it('внутренняя роль (не external_auditor) → null даже при заданном scope', async () => {
    expect(await resolveAuditorScope(dbService, tenantId, adminId)).toBeNull();
  });
});

describe('EngagementsService.list scoped (T-111)', () => {
  it('scoped external_auditor видит только engagement своей дочки', async () => {
    const rows = await engagementsService.list(tenantId, scopedId, 'en');
    expect(rows.map((r) => r.subsidiary).sort()).toEqual(['Sub A']);
  });
  it('external_auditor с полным скоупом видит обе дочки', async () => {
    const rows = await engagementsService.list(tenantId, fullId, 'en');
    expect(rows.map((r) => r.subsidiary).sort()).toEqual(['Sub A', 'Sub B']);
  });
  it('внутренний Admin (не режется) видит обе дочки', async () => {
    const rows = await engagementsService.list(tenantId, adminId, 'en');
    expect(rows.map((r) => r.subsidiary).sort()).toEqual(['Sub A', 'Sub B']);
  });
  it('external_auditor с пустым scope [] не видит ни одного engagement', async () => {
    const rows = await engagementsService.list(tenantId, emptyId, 'en');
    expect(rows).toHaveLength(0);
  });
});

describe('assertSubsidiaryInAuditorScope guard (T-122)', () => {
  it('scoped external_auditor + дочка в scope → пропускает', async () => {
    await expect(
      assertSubsidiaryInAuditorScope(dbService, tenantId, scopedId, subAId),
    ).resolves.toBeUndefined();
  });
  it('scoped external_auditor + чужая дочка → NotFound', async () => {
    await expect(
      assertSubsidiaryInAuditorScope(dbService, tenantId, scopedId, subBId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('scoped external_auditor + null-дочка (standalone) → NotFound', async () => {
    await expect(
      assertSubsidiaryInAuditorScope(dbService, tenantId, scopedId, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('empty-scope external_auditor + любая дочка → NotFound', async () => {
    await expect(
      assertSubsidiaryInAuditorScope(dbService, tenantId, emptyId, subAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('full-scope external_auditor (scope=null) + чужая дочка → пропускает', async () => {
    await expect(
      assertSubsidiaryInAuditorScope(dbService, tenantId, fullId, subBId),
    ).resolves.toBeUndefined();
  });
  it('внутренний Admin + чужая дочка → пропускает (не режется)', async () => {
    await expect(
      assertSubsidiaryInAuditorScope(dbService, tenantId, adminId, subBId),
    ).resolves.toBeUndefined();
  });
});

describe('EngagementsService.detail scoped (T-122)', () => {
  it('scoped external_auditor читает engagement своей дочки', async () => {
    const d = await engagementsService.detail(tenantId, scopedId, engAId, 'en');
    expect(d.title).toBe('Audit A');
  });
  it('scoped external_auditor НЕ читает engagement чужой дочки по ID → NotFound', async () => {
    await expect(
      engagementsService.detail(tenantId, scopedId, engBId, 'en'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('full-scope external_auditor читает engagement чужой дочки', async () => {
    const d = await engagementsService.detail(tenantId, fullId, engBId, 'en');
    expect(d.title).toBe('Audit B');
  });
  it('empty-scope external_auditor не читает свою же дочку по ID → NotFound', async () => {
    await expect(engagementsService.detail(tenantId, emptyId, engAId, 'en')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('внутренний Admin читает любой engagement по ID', async () => {
    const d = await engagementsService.detail(tenantId, adminId, engBId, 'en');
    expect(d.title).toBe('Audit B');
  });
});
