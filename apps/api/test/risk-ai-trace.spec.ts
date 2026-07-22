import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { RisksService } from '../src/risks/risks.service';
import { auditLog, finding, risk, tenant, user } from '../src/db/schema';

const run = Date.now();
const dbService = new DbService();
const service = new RisksService(dbService, new AuditLogService(dbService), {} as never);

let tenantId: string;
let userId: string;

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug: `risk-ai-trace-${run}`, name: 'Risk AI Trace' })
    .returning();
  tenantId = t!.id;
  const [u] = await dbService.db
    .insert(user)
    .values({
      email: `risk-ai-trace-${run}@demo.io`,
      fullName: 'Risk Trace Auditor',
      passwordHash: 'x',
    })
    .returning();
  userId = u!.id;
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(finding).where(eq(finding.tenantId, tenantId));
    await tx.delete(risk).where(eq(risk.tenantId, tenantId));
  });
  await dbService.db.delete(user).where(eq(user.id, userId));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('AI risk suggestion HITL traceability', () => {
  it('records accepted AI risk proposal metadata in audit log and exposes it on detail', async () => {
    const created = await service.create(
      { tenantId, userId, ip: '::1' },
      {
        titleI18n: { en: 'Business risk — Backup restoration is not tested' },
        descriptionI18n: { en: 'Potential continuity risk derived from a finding.' },
        category: 'continuity',
        domain: 'BCK-01',
        inherentImpact: 4,
        inherentLikelihood: 4,
        residualImpact: 4,
        residualLikelihood: 4,
        treatment: 'mitigate',
        aiReview: {
          source: 'risk_suggestion',
          decision: 'accepted',
          reviewStatus: 'accepted_by_human',
          sourceFindingId: '00000000-0000-0000-0000-000000000001',
          confidence: 0.8,
          affectedProcess: 'Business continuity and service recovery',
          affectedAsset: 'Backup platform / recovery evidence',
          affectedControlRef: 'BCK-01',
          evidenceRef: {
            type: 'finding',
            id: '00000000-0000-0000-0000-000000000001',
            location: 'Finding linked to BCK-01',
          },
          draft: {
            title: 'Business risk — Backup restore gap',
            description: 'AI draft continuity risk.',
            affectedProcess: 'Continuity',
            affectedAsset: 'Backup evidence',
            inherentImpact: 3,
            inherentLikelihood: 4,
          },
          dedupeFingerprint: 'continuity:bck-01:backup-restoration',
        },
      },
    );

    const logs = await dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ action: auditLog.action, after: auditLog.after })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'risk'), eq(auditLog.entityId, created.id))),
    );

    expect(logs.map((log) => log.action)).toContain('ai_risk.accepted');
    expect(logs.find((log) => log.action === 'ai_risk.accepted')?.after).toMatchObject({
      aiReview: {
        sourceFindingId: '00000000-0000-0000-0000-000000000001',
        confidence: 0.8,
        affectedProcess: 'Business continuity and service recovery',
        affectedAsset: 'Backup platform / recovery evidence',
        affectedControlRef: 'BCK-01',
        editedFields: [
          {
            field: 'title',
            draftValue: 'Business risk — Backup restore gap',
            acceptedValue: 'Business risk — Backup restoration is not tested',
          },
          {
            field: 'description',
            draftValue: 'AI draft continuity risk.',
            acceptedValue: 'Potential continuity risk derived from a finding.',
          },
          {
            field: 'affectedProcess',
            draftValue: 'Continuity',
            acceptedValue: 'Business continuity and service recovery',
          },
          {
            field: 'affectedAsset',
            draftValue: 'Backup evidence',
            acceptedValue: 'Backup platform / recovery evidence',
          },
          { field: 'inherentImpact', draftValue: 3, acceptedValue: 4 },
        ],
      },
      reviewerAction: 'created_register_risk',
    });

    const detail = await service.detail(tenantId, created.id, 'en');
    expect(detail.aiReview).toMatchObject({
      source: 'risk_suggestion',
      decision: 'accepted',
      reviewStatus: 'accepted_by_human',
      sourceFindingId: '00000000-0000-0000-0000-000000000001',
      confidence: 0.8,
      affectedProcess: 'Business continuity and service recovery',
      affectedAsset: 'Backup platform / recovery evidence',
      affectedControlRef: 'BCK-01',
      editedFields: [
        {
          field: 'title',
          draftValue: 'Business risk — Backup restore gap',
          acceptedValue: 'Business risk — Backup restoration is not tested',
        },
        {
          field: 'description',
          draftValue: 'AI draft continuity risk.',
          acceptedValue: 'Potential continuity risk derived from a finding.',
        },
        {
          field: 'affectedProcess',
          draftValue: 'Continuity',
          acceptedValue: 'Business continuity and service recovery',
        },
        {
          field: 'affectedAsset',
          draftValue: 'Backup evidence',
          acceptedValue: 'Backup platform / recovery evidence',
        },
        { field: 'inherentImpact', draftValue: 3, acceptedValue: 4 },
      ],
      dedupeFingerprint: 'continuity:bck-01:backup-restoration',
    });
  });

  it('records rejected AI risk proposals and removes them from the suggestion queue', async () => {
    const [row] = await dbService.withTenant(tenantId, (tx) =>
      tx
        .insert(finding)
        .values({
          tenantId,
          titleI18n: { en: 'Vendor backup restoration is not tested' },
          riskRating: 'high',
          status: 'identified',
        })
        .returning({ id: finding.id }),
    );

    await expect(service.suggestions(tenantId, 'en')).resolves.toMatchObject({ count: 1 });

    await service.rejectSuggestion(
      { tenantId, userId, ip: '::1' },
      {
        sourceFindingId: row!.id,
        title: 'Business risk — Vendor backup restoration is not tested',
        confidence: 0.8,
        dedupeFingerprint: 'continuity:vendor-backup-restoration',
      },
    );

    await expect(service.suggestions(tenantId, 'en')).resolves.toMatchObject({ count: 0 });

    const logs = await dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ action: auditLog.action, after: auditLog.after })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'finding'), eq(auditLog.entityId, row!.id))),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'ai_risk.rejected',
      after: {
        source: 'risk_suggestion',
        decision: 'rejected',
        reviewStatus: 'rejected_by_human',
        sourceFindingId: row!.id,
      },
    });
  });
});
