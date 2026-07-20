import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { AuditorAssessmentsService } from '../src/auditor-assessments/auditor-assessments.service';
import {
  auditorAssessment,
  engagement,
  finding,
  membership,
  role,
  subsidiary,
  tenant,
  user,
} from '../src/db/schema';

/**
 * DoD T-113 (EP-AUDITOR-RELATIONSHIP): Auditor Assessment — вердикт аудитора по
 * пункту аудита с раундами; ставит только аудитор; внешний — в своём scope.
 * Интеграционный: инфра + миграции (0069) + `pnpm seed` (пресеты).
 */
const run = Date.now();
const emails = {
  auditor: `aa-aud-${run}@firm.io`,
  extA: `aa-exta-${run}@firm.io`,
  extB: `aa-extb-${run}@firm.io`,
  resp: `aa-resp-${run}@t.io`,
};

const dbService = new DbService();
const service = new AuditorAssessmentsService(dbService, new AuditLogService(dbService));

let tenantId: string;
let subAId: string;
let subBId: string;
let findingId: string;
const uid: Record<string, string> = {};

async function presetRoleId(nameEn: string): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const found = roles.find((r) => r.nameI18n.en === nameEn);
  if (!found) throw new Error(`Нет пресета ${nameEn} — прогнать pnpm seed`);
  return found.id;
}

const actor = (key: keyof typeof emails) => ({ tenantId, userId: uid[key]!, ip: '::1' });

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug: `auditor-assessment-${run}`, name: 'Auditor Assessment T' })
    .returning();
  tenantId = t!.id;
  const users = await dbService.db
    .insert(user)
    .values(Object.values(emails).map((email) => ({ email, fullName: email, passwordHash: 'x' })))
    .returning();
  (Object.keys(emails) as (keyof typeof emails)[]).forEach((k, i) => (uid[k] = users[i]!.id));

  await dbService.withTenant(tenantId, async (tx) => {
    const [a] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'A' } })
      .returning();
    const [b] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'B' } })
      .returning();
    subAId = a!.id;
    subBId = b!.id;
    const [eng] = await tx
      .insert(engagement)
      .values({ tenantId, subsidiaryId: subAId, titleI18n: { en: 'Audit A' } })
      .returning();
    const [f] = await tx
      .insert(finding)
      .values({ tenantId, engagementId: eng!.id, titleI18n: { en: 'Gap' }, riskRating: 'high' })
      .returning();
    findingId = f!.id;
  });

  const extRole = await presetRoleId('External Auditor');
  await dbService.db.insert(membership).values([
    { userId: uid.auditor!, tenantId, roleId: await presetRoleId('Admin'), category: 'auditor' },
    {
      userId: uid.extA!,
      tenantId,
      roleId: extRole,
      category: 'external_auditor',
      subsidiaryScope: [subAId],
    },
    {
      userId: uid.extB!,
      tenantId,
      roleId: extRole,
      category: 'external_auditor',
      subsidiaryScope: [subBId],
    },
    {
      userId: uid.resp!,
      tenantId,
      roleId: await presetRoleId('Collaborator'),
      category: 'respondent',
    },
  ]);
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(auditorAssessment).where(eq(auditorAssessment.tenantId, tenantId));
    await tx.delete(finding).where(eq(finding.tenantId, tenantId));
    await tx.delete(engagement).where(eq(engagement.tenantId, tenantId));
    await tx.delete(subsidiary).where(eq(subsidiary.tenantId, tenantId));
  });
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  for (const email of Object.values(emails)) {
    await dbService.db.delete(user).where(eq(user.email, email));
  }
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('Auditor Assessment (T-113)', () => {
  it('аудитор ставит вердикт — раунд растёт, история сохраняется', async () => {
    const r1 = await service.create(actor('auditor'), {
      targetType: 'finding',
      targetId: findingId,
      verdict: 'exception',
      note: 'нет доказательств',
    });
    expect(r1.round).toBe(1);
    const r2 = await service.create(actor('auditor'), {
      targetType: 'finding',
      targetId: findingId,
      verdict: 'satisfactory',
    });
    expect(r2.round).toBe(2);

    const history = await service.listFor(tenantId, 'finding', findingId);
    expect(history.map((h) => `${h.round}:${h.verdict}`)).toEqual([
      '1:exception',
      '2:satisfactory',
    ]);
    expect(history[0]!.note).toBe('нет доказательств');
  });

  it('latest возвращает последний раунд', async () => {
    const latest = await service.latest(tenantId, 'finding', findingId);
    expect(latest?.verdict).toBe('satisfactory');
    expect(latest?.round).toBe(2);
  });

  it('внешний аудитор в scope дочки A — ставит', async () => {
    const r = await service.create(actor('extA'), {
      targetType: 'finding',
      targetId: findingId,
      verdict: 'exception',
    });
    expect(r.round).toBe(3);
  });

  it('внешний аудитор вне scope (дочка B) → 403', async () => {
    await expect(
      service.create(actor('extB'), {
        targetType: 'finding',
        targetId: findingId,
        verdict: 'exception',
      }),
    ).rejects.toThrow(/scope/);
  });

  it('не-аудитор (respondent) → 403', async () => {
    await expect(
      service.create(actor('resp'), {
        targetType: 'finding',
        targetId: findingId,
        verdict: 'exception',
      }),
    ).rejects.toThrow(/аудитор/);
  });

  it('несуществующая цель → 400', async () => {
    await expect(
      service.create(actor('auditor'), {
        targetType: 'finding',
        targetId: '11111111-1111-7111-8111-111111111111',
        verdict: 'exception',
      }),
    ).rejects.toThrow(/не найдена/);
  });

  it('недопустимый targetType → 400', async () => {
    await expect(
      service.create(actor('auditor'), {
        targetType: 'vendor',
        targetId: findingId,
        verdict: 'exception',
      }),
    ).rejects.toThrow(/targetType/);
  });
});
