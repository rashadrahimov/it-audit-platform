import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { FindingsService } from '../src/findings/findings.service';
import { DEFAULT_SLA_WINDOWS } from '../src/sla-config/sla-config.service';
import { auditLog, finding, tenant, user } from '../src/db/schema';

const run = Date.now();
const dbService = new DbService();
const service = new FindingsService(
  dbService,
  new AuditLogService(dbService),
  {} as never,
  { fieldLevels: async () => ({}) } as never,
  {} as never,
  { configOf: async () => DEFAULT_SLA_WINDOWS } as never,
);

let tenantId: string;
let userId: string;

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug: `finding-ai-trace-${run}`, name: 'Finding AI Trace' })
    .returning();
  tenantId = t!.id;
  const [u] = await dbService.db
    .insert(user)
    .values({
      email: `finding-ai-trace-${run}@demo.io`,
      fullName: 'AI Trace Auditor',
      passwordHash: 'x',
    })
    .returning();
  userId = u!.id;
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(finding).where(eq(finding.tenantId, tenantId));
  });
  await dbService.db.delete(user).where(eq(user.id, userId));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('AI finding HITL edit traceability', () => {
  it('records fields edited by the auditor before accepting an AI draft', async () => {
    const created = await service.create(
      { tenantId, userId, ip: '::1' },
      {
        titleI18n: { en: 'Auditor-refined MFA gap' },
        descriptionI18n: { en: 'AI draft was refined with more precise business context.' },
        riskRating: 'high',
        aiReview: {
          source: 'finding_suggestion',
          decision: 'accepted',
          confidence: 0.82,
          expected: 'Privileged users must use MFA.',
          observed: 'Two privileged users have no MFA.',
          draftTitle: 'MFA gap',
          draftDescription: 'AI draft was refined with more precise business context.',
          draftRiskRating: 'medium',
          reason: 'Evidence-backed gap from access review.',
        },
      },
    );

    const [row] = await dbService.withTenant(tenantId, (tx) =>
      tx.select({ custom: finding.custom }).from(finding).where(eq(finding.id, created.id)),
    );
    const ai = (row!.custom as { ai?: { editedFields?: unknown[] } }).ai;
    expect(ai?.editedFields).toEqual([
      {
        field: 'title',
        draftValue: 'MFA gap',
        acceptedValue: 'Auditor-refined MFA gap',
      },
      {
        field: 'riskRating',
        draftValue: 'medium',
        acceptedValue: 'high',
      },
    ]);

    const logs = await dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ action: auditLog.action, after: auditLog.after })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'finding'), eq(auditLog.entityId, created.id))),
    );
    expect(logs.map((log) => log.action)).toContain('ai_finding.accepted');
    const editLog = logs.find((log) => log.action === 'ai_finding.edited');
    expect(editLog?.after).toMatchObject({
      reviewStatus: 'accepted_with_edits',
      fields: [
        { field: 'title', value: 'Auditor-refined MFA gap' },
        { field: 'riskRating', value: 'high' },
      ],
    });
  });
});
