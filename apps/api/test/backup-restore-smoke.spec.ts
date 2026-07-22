import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { Client } from 'pg';
import { AuditLogService } from '../src/audit/audit-log.service';
import { DbService } from '../src/db/db.service';
import {
  checklistItem,
  engagement,
  finding,
  membership,
  response,
  role,
  subsidiary,
  tenant,
  user,
} from '../src/db/schema';
import { EngagementsService } from '../src/engagements/engagements.service';
import { env } from '../src/env';

/**
 * T-H144 / BCK-04 repo-side smoke: granular engagement backup/restore proof.
 * Export captures the source audit as JSON; duplicate restores it in-app with fresh IDs and
 * remapped checklist/response/finding foreign keys.
 */
const run = Date.now();
const dbService = new DbService();
const auditLogService = new AuditLogService(dbService);
const service = new EngagementsService(dbService, auditLogService);

let tenantId: string;
let userId: string;
let membershipId: string;
let engagementId: string;

async function adminRoleId(): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const admin = roles.find((r) => r.nameI18n.en === 'Admin');
  if (!admin) throw new Error('Admin role seed is missing; run pnpm seed before integration tests');
  return admin.id;
}

async function asOwner<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: env.databaseUrlOwner });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug: `bck-smoke-${run}`, name: 'Backup Smoke' })
    .returning();
  tenantId = t!.id;

  const [u] = await dbService.db
    .insert(user)
    .values({
      email: `bck-smoke-${run}@demo.io`,
      fullName: 'Backup Smoke Admin',
      passwordHash: 'x',
    })
    .returning();
  userId = u!.id;

  const [m] = await dbService.db
    .insert(membership)
    .values({ tenantId, userId, roleId: await adminRoleId(), category: 'auditor' })
    .returning();
  membershipId = m!.id;

  await dbService.withTenant(tenantId, async (tx) => {
    const [sub] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'Backup Subsidiary' } })
      .returning();
    const [eng] = await tx
      .insert(engagement)
      .values({
        tenantId,
        subsidiaryId: sub!.id,
        titleI18n: { en: 'Backup restore audit' },
        state: 'findings_drafting',
      })
      .returning();
    engagementId = eng!.id;

    const [item] = await tx
      .insert(checklistItem)
      .values({
        engagementId,
        ref: 'BCK-01',
        objectiveI18n: { en: 'Backup objective' },
        questionI18n: { en: 'Is restore tested?' },
        order: 1,
      })
      .returning();
    const [answer] = await tx
      .insert(response)
      .values({
        checklistItemId: item!.id,
        respondentMembershipId: membershipId,
        text: 'Restore drill was not evidenced.',
        complianceStatus: 'non_compliant',
      })
      .returning();
    await tx.insert(finding).values({
      tenantId,
      engagementId,
      checklistItemId: item!.id,
      responseId: answer!.id,
      titleI18n: { en: 'Restore drill missing' },
      riskRating: 'high',
      status: 'identified',
    });
  });
});

afterAll(async () => {
  const engagementIds = await dbService.withTenant(tenantId, async (tx) =>
    tx.select({ id: engagement.id }).from(engagement).where(eq(engagement.tenantId, tenantId)),
  );
  const ids = engagementIds.map((e) => e.id);
  await asOwner((client) => client.query('DELETE FROM audit_log WHERE tenant_id = $1', [tenantId]));
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(finding).where(eq(finding.tenantId, tenantId));
    if (ids.length) {
      const items = await tx
        .select({ id: checklistItem.id })
        .from(checklistItem)
        .where(inArray(checklistItem.engagementId, ids));
      if (items.length) {
        await tx.delete(response).where(
          inArray(
            response.checklistItemId,
            items.map((item) => item.id),
          ),
        );
      }
      await tx.delete(checklistItem).where(inArray(checklistItem.engagementId, ids));
      await tx.delete(engagement).where(inArray(engagement.id, ids));
    }
    await tx.delete(subsidiary).where(eq(subsidiary.tenantId, tenantId));
  });
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  await dbService.db.delete(user).where(eq(user.id, userId));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('BCK-04 engagement backup/restore smoke', () => {
  it('exports source snapshot and restores a duplicate with remapped IDs', async () => {
    const source = await service.exportEngagement(tenantId, engagementId);
    expect(source.version).toBe(1);
    expect(source.checklist).toHaveLength(1);
    expect(source.responses).toHaveLength(1);
    expect(source.findings).toHaveLength(1);

    const restored = await service.duplicateEngagement(
      { tenantId, userId, ip: '::1' },
      engagementId,
    );
    expect(restored).toMatchObject({ checklist: 1, findings: 1 });
    expect(restored.id).not.toBe(engagementId);

    const copy = await service.exportEngagement(tenantId, restored.id);
    expect(copy.engagement.titleI18n.en).toBe('Backup restore audit (restored)');
    expect(copy.checklist).toHaveLength(source.checklist.length);
    expect(copy.responses).toHaveLength(source.responses.length);
    expect(copy.findings).toHaveLength(source.findings.length);

    const sourceItemIds = new Set(source.checklist.map((item) => item.id));
    const copyItemIds = new Set(copy.checklist.map((item) => item.id));
    const copyResponseIds = new Set(copy.responses.map((item) => item.id));
    expect([...copyItemIds].some((id) => sourceItemIds.has(id))).toBe(false);
    expect(copy.responses.every((item) => copyItemIds.has(item.checklistItemId))).toBe(true);
    expect(
      copy.findings.every((item) => item.checklistItemId && copyItemIds.has(item.checklistItemId)),
    ).toBe(true);
    expect(
      copy.findings.every((item) => item.responseId && copyResponseIds.has(item.responseId)),
    ).toBe(true);
  });
});
