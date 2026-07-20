import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { EngagementsService } from '../src/engagements/engagements.service';
import {
  engagement,
  engagementMember,
  membership,
  role,
  subsidiary,
  tenant,
  user,
} from '../src/db/schema';

/**
 * DoD T-116 (EP-DEBT, добавка D2): состав аудит-команды на engagement с ролью.
 * assign/list/remove; выпуск отчёта (report_issued) — только lead/approver из
 * команды; не-члены с RBAC не ограничиваются. Интеграционный: инфра + миграции
 * (0070) + `pnpm seed`.
 */
const run = Date.now();
const emails = {
  admin: `em-admin-${run}@t.io`,
  assessor: `em-assessor-${run}@t.io`,
  approver: `em-approver-${run}@t.io`,
};

const dbService = new DbService();
const service = new EngagementsService(dbService, new AuditLogService(dbService));

let tenantId: string;
let subId: string;
let engA: string;
let engB: string;
let engC: string; // findings_drafting — рабочая стадия (T-123)
let engD: string; // approval — для override edit (T-123)
let engE: string; // approval — для override read_only (T-123)
const uid: Record<string, string> = {};
const mid: Record<string, string> = {};

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
    .values({ slug: `eng-member-${run}`, name: 'Eng Member T' })
    .returning();
  tenantId = t!.id;
  const users = await dbService.db
    .insert(user)
    .values(Object.values(emails).map((email) => ({ email, fullName: email, passwordHash: 'x' })))
    .returning();
  (Object.keys(emails) as (keyof typeof emails)[]).forEach((k, i) => (uid[k] = users[i]!.id));

  const adminRole = await presetRoleId('Admin');
  const ms = await dbService.db
    .insert(membership)
    .values(
      (Object.keys(emails) as (keyof typeof emails)[]).map((k) => ({
        userId: uid[k]!,
        tenantId,
        roleId: adminRole,
        category: 'auditor',
      })),
    )
    .returning();
  (Object.keys(emails) as (keyof typeof emails)[]).forEach((k, i) => (mid[k] = ms[i]!.id));

  await dbService.withTenant(tenantId, async (tx) => {
    const [s] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'S' } })
      .returning();
    subId = s!.id;
    const [a] = await tx
      .insert(engagement)
      .values({
        tenantId,
        subsidiaryId: subId,
        titleI18n: { en: 'A' },
        mode: 'formal',
        state: 'approval',
      })
      .returning();
    const [b] = await tx
      .insert(engagement)
      .values({
        tenantId,
        subsidiaryId: subId,
        titleI18n: { en: 'B' },
        mode: 'formal',
        state: 'approval',
      })
      .returning();
    engA = a!.id;
    engB = b!.id;
    const [c] = await tx
      .insert(engagement)
      .values({
        tenantId,
        subsidiaryId: subId,
        titleI18n: { en: 'C' },
        mode: 'formal',
        state: 'findings_drafting',
      })
      .returning();
    const [d] = await tx
      .insert(engagement)
      .values({
        tenantId,
        subsidiaryId: subId,
        titleI18n: { en: 'D' },
        mode: 'formal',
        state: 'approval',
      })
      .returning();
    const [e] = await tx
      .insert(engagement)
      .values({
        tenantId,
        subsidiaryId: subId,
        titleI18n: { en: 'E' },
        mode: 'formal',
        state: 'approval',
      })
      .returning();
    engC = c!.id;
    engD = d!.id;
    engE = e!.id;
  });
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(engagementMember).where(eq(engagementMember.tenantId, tenantId));
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

describe('engagement members (T-116)', () => {
  it('assign + list состав команды', async () => {
    const r = await service.assignMember(actor('admin'), engA, {
      membershipId: mid.assessor!,
      engagementRole: 'assessor',
    });
    expect(r.engagementRole).toBe('assessor');
    await service.assignMember(actor('admin'), engA, {
      membershipId: mid.approver!,
      engagementRole: 'approver',
    });
    const members = await service.listMembers(tenantId, engA);
    expect(members.length).toBe(2);
    expect(members.map((m) => m.engagementRole).sort()).toEqual(['approver', 'assessor']);
  });

  it('assign — upsert роли (повторно с другой ролью)', async () => {
    const r = await service.assignMember(actor('admin'), engA, {
      membershipId: mid.assessor!,
      engagementRole: 'reviewer',
    });
    expect(r.engagementRole).toBe('reviewer');
    // вернём assessor для теста запрета ниже
    await service.assignMember(actor('admin'), engA, {
      membershipId: mid.assessor!,
      engagementRole: 'assessor',
    });
    const members = await service.listMembers(tenantId, engA);
    expect(members.length).toBe(2);
  });

  it('assessor НЕ может выпустить отчёт (report_issued) → 403', async () => {
    await expect(service.transition(actor('assessor'), engA, 'report_issued')).rejects.toThrow(
      /утверждать|approver/,
    );
  });

  it('approver выпускает отчёт → успех', async () => {
    const res = await service.transition(actor('approver'), engA, 'report_issued');
    expect(res!.state).toBe('report_issued');
  });

  it('не-член команды (RBAC) не ограничивается — engB без членов', async () => {
    const res = await service.transition(actor('admin'), engB, 'report_issued');
    expect(res!.state).toBe('report_issued');
  });

  it('remove снимает участника', async () => {
    const members = await service.listMembers(tenantId, engA);
    const assessor = members.find((m) => m.membershipId === mid.assessor);
    await service.removeMember(actor('admin'), engA, assessor!.id);
    const left = await service.listMembers(tenantId, engA);
    expect(left.length).toBe(1);
  });

  it('битая роль → 400', async () => {
    await expect(
      service.assignMember(actor('admin'), engA, {
        membershipId: mid.admin!,
        engagementRole: 'boss',
      }),
    ).rejects.toThrow(/engagementRole/);
  });

  it('битый membership → 400', async () => {
    await expect(
      service.assignMember(actor('admin'), engA, {
        membershipId: '11111111-1111-7111-8111-111111111111',
        engagementRole: 'observer',
      }),
    ).rejects.toThrow(/membershipId/);
  });
});

describe('engagement member — постадийные права (T-123)', () => {
  it('observer НЕ двигает даже рабочую стадию → 403', async () => {
    await service.assignMember(actor('admin'), engC, {
      membershipId: mid.admin!,
      engagementRole: 'observer',
    });
    await expect(service.transition(actor('admin'), engC, 'management_response')).rejects.toThrow(
      /наблюдатель/,
    );
  });

  it('assessor двигает рабочую стадию (не sign-off) → успех', async () => {
    await service.assignMember(actor('admin'), engC, {
      membershipId: mid.assessor!,
      engagementRole: 'assessor',
    });
    const res = await service.transition(actor('assessor'), engC, 'management_response');
    expect(res!.state).toBe('management_response');
  });

  it('stage_permissions {report_issued: edit} — грант: assessor выпускает отчёт', async () => {
    await service.assignMember(actor('admin'), engD, {
      membershipId: mid.assessor!,
      engagementRole: 'assessor',
      stagePermissions: { report_issued: 'edit' },
    });
    const res = await service.transition(actor('assessor'), engD, 'report_issued');
    expect(res!.state).toBe('report_issued');
  });

  it('stage_permissions {report_issued: read_only} — запрет даже approver → 403', async () => {
    await service.assignMember(actor('admin'), engE, {
      membershipId: mid.approver!,
      engagementRole: 'approver',
      stagePermissions: { report_issued: 'read_only' },
    });
    await expect(service.transition(actor('approver'), engE, 'report_issued')).rejects.toThrow(
      /stage_permissions/,
    );
  });
});
