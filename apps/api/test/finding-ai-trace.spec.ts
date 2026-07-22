import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { FindingsService } from '../src/findings/findings.service';
import { DEFAULT_SLA_WINDOWS } from '../src/sla-config/sla-config.service';
import { auditLog, document, finding, membership, role, tenant, user } from '../src/db/schema';

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
let membershipId: string;
let evidenceDocumentId: string;

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
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const roleId = roles.find((r) => r.nameI18n.en === 'Auditor')?.id ?? roles[0]?.id;
  if (!roleId) throw new Error('Нет системной роли — прогнать pnpm seed');
  await dbService.withTenant(tenantId, async (tx) => {
    const [m] = await tx
      .insert(membership)
      .values({ tenantId, userId, roleId, isAuditSeat: true, category: 'auditor' })
      .returning();
    membershipId = m!.id;
    const [doc] = await tx
      .insert(document)
      .values({
        tenantId,
        storageKey: `finding-ai-trace/${run}/access-review.xlsx`,
        filename: 'access-review.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 128,
        sha256: 'finding-ai-trace',
        ownerMembershipId: membershipId,
      })
      .returning();
    evidenceDocumentId = doc!.id;
  });
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(finding).where(eq(finding.tenantId, tenantId));
    await tx.delete(document).where(eq(document.tenantId, tenantId));
    await tx.delete(membership).where(eq(membership.tenantId, tenantId));
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
        recommendationI18n: {
          en: 'Enforce MFA for all privileged users and retain access-review evidence.',
        },
        aiReview: {
          source: 'finding_suggestion',
          decision: 'accepted',
          confidence: 0.82,
          expected: 'Privileged users must use MFA.',
          observed: 'Two privileged users have no MFA.',
          draftTitle: 'MFA gap',
          draftDescription: 'AI draft was refined with more precise business context.',
          draftRiskRating: 'medium',
          draftRecommendation: 'Enforce MFA.',
          reason: 'Evidence-backed gap from access review.',
          controlClause: 'ISO 27001 A.5.15',
          riskJustification:
            'High risk because privileged accounts without MFA can materially increase unauthorized access exposure.',
          evidenceReferences: [
            {
              documentId: evidenceDocumentId,
              filename: 'access-review.xlsx',
              relation: 'evidence',
              location: 'Sheet Users, rows 12-13',
            },
          ],
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
      {
        field: 'recommendation',
        draftValue: 'Enforce MFA.',
        acceptedValue: 'Enforce MFA for all privileged users and retain access-review evidence.',
      },
    ]);

    const logs = await dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ action: auditLog.action, after: auditLog.after })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'finding'), eq(auditLog.entityId, created.id))),
    );
    expect(logs.map((log) => log.action)).toContain('ai_finding.accepted');
    expect(logs.find((log) => log.action === 'ai_finding.accepted')?.after).toMatchObject({
      reason: 'Evidence-backed gap from access review.',
      controlClause: 'ISO 27001 A.5.15',
      riskJustification:
        'High risk because privileged accounts without MFA can materially increase unauthorized access exposure.',
    });
    const editLog = logs.find((log) => log.action === 'ai_finding.edited');
    expect(editLog?.after).toMatchObject({
      reviewStatus: 'accepted_with_edits',
      fields: [
        { field: 'title', value: 'Auditor-refined MFA gap' },
        { field: 'riskRating', value: 'high' },
        {
          field: 'recommendation',
          value: 'Enforce MFA for all privileged users and retain access-review evidence.',
        },
      ],
    });
  });

  it('blocks accepting an AI finding without a source document reference', async () => {
    await expect(
      service.create(
        { tenantId, userId, ip: '::1' },
        {
          titleI18n: { en: 'Unsupported AI finding' },
          descriptionI18n: { en: 'AI output has no source document attached.' },
          riskRating: 'medium',
          recommendationI18n: { en: 'Attach evidence before acceptance.' },
          aiReview: {
            source: 'finding_suggestion',
            decision: 'accepted',
            confidence: 0.51,
            expected: 'Control evidence must exist.',
            observed: 'No evidence reference was provided.',
            draftTitle: 'Unsupported AI finding',
            draftDescription: 'AI output has no source document attached.',
            draftRiskRating: 'medium',
            draftRecommendation: 'Attach evidence before acceptance.',
            reason: 'AI output has no cited evidence.',
            controlClause: 'AC-01',
            riskJustification: 'Medium risk until evidence is attached and reviewed.',
          },
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'ai_finding_evidence_required',
      },
    });
  });

  it('blocks accepting an AI finding without explainability metadata', async () => {
    await expect(
      service.create(
        { tenantId, userId, ip: '::1' },
        {
          titleI18n: { en: 'Unexplained AI finding' },
          descriptionI18n: { en: 'AI output has evidence but no explainability.' },
          riskRating: 'medium',
          recommendationI18n: { en: 'Add rationale, control clause and risk justification.' },
          aiReview: {
            source: 'finding_suggestion',
            decision: 'accepted',
            confidence: 0.7,
            expected: 'Control rationale must be visible.',
            observed: 'No explainability metadata was provided.',
            draftTitle: 'Unexplained AI finding',
            draftDescription: 'AI output has evidence but no explainability.',
            draftRiskRating: 'medium',
            draftRecommendation: 'Add rationale.',
            reason: '',
            controlClause: '',
            riskJustification: '',
            evidenceReferences: [
              {
                documentId: evidenceDocumentId,
                filename: 'access-review.xlsx',
                relation: 'evidence',
                location: 'Sheet Users, rows 12-13',
              },
            ],
          },
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'ai_finding_explainability_required',
        fields: ['reason', 'controlClause', 'riskJustification'],
      },
    });
  });
});
