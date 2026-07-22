import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import {
  auditType,
  checklistItem,
  document,
  documentLink,
  engagement,
  finding,
  membership,
  response,
  risk,
  subsidiary,
  user,
} from '../db/schema';

export const REPORT_DELIVERABLES = [
  'audit_report',
  'nonconformities',
  'risk_matrix',
  'action_plan',
  'executive_summary',
] as const;

export type ReportDeliverable = (typeof REPORT_DELIVERABLES)[number];

export const DELIVERABLE_LABELS: Record<ReportDeliverable, Record<Locale, string>> = {
  audit_report: {
    en: 'Audit Report',
    az: 'Audit hesabatı',
    ru: 'Аудиторский отчёт',
  },
  nonconformities: {
    en: 'Non-Conformities List',
    az: 'Uyğunsuzluqlar siyahısı',
    ru: 'Список несоответствий',
  },
  risk_matrix: {
    en: 'Risk Matrix',
    az: 'Risk matrisi',
    ru: 'Матрица рисков',
  },
  action_plan: {
    en: 'Action Plan',
    az: 'Tədbirlər planı',
    ru: 'План действий',
  },
  executive_summary: {
    en: 'Executive Summary',
    az: 'İcraçı xülasə',
    ru: 'Резюме для руководства',
  },
};

export const REPORT_PACKAGE_FORMATS = [
  {
    key: 'pdf',
    label: 'PDF',
    mime: 'application/pdf',
    editable: false,
    analyticsReady: false,
  },
  {
    key: 'docx',
    label: 'Word',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    editable: true,
    analyticsReady: false,
  },
  {
    key: 'xlsx',
    label: 'Excel',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    editable: false,
    analyticsReady: true,
  },
] as const;

export const REPORT_PACKAGE_LOCALES = ['en', 'az', 'ru'] as const satisfies readonly Locale[];

interface ReportPackageReadinessSnapshot {
  ready: boolean;
  score: number;
  checks: { key: string; passed: boolean }[];
}

export function buildReportPackageManifest(
  engagementId: string,
  locale: Locale,
  readiness: ReportPackageReadinessSnapshot,
) {
  return {
    engagementId,
    locale,
    supportedLocales: REPORT_PACKAGE_LOCALES,
    formats: REPORT_PACKAGE_FORMATS,
    deliverables: REPORT_DELIVERABLES.map((deliverable) => ({
      key: deliverable,
      title: DELIVERABLE_LABELS[deliverable][locale],
      formats: REPORT_PACKAGE_FORMATS.map((format) => ({
        key: format.key,
        href: `/engagements/${engagementId}/report?format=${format.key}&locale=${locale}&deliverable=${deliverable}`,
      })),
    })),
    totalFiles: REPORT_DELIVERABLES.length * REPORT_PACKAGE_FORMATS.length,
    dataSources: ['checklist', 'responses', 'findings', 'risks', 'evidence_links'],
    evidenceGrounded: true,
    humanReviewRequired: true,
    readinessGate: {
      ready: readiness.ready,
      score: readiness.score,
      checks: readiness.checks,
    },
  };
}

export interface ReportChecklistRow {
  ref: string;
  question: string;
  answer: string | null;
  compliance: string | null;
}

export interface ReportFindingRow {
  title: string;
  riskRating: string;
  status: string;
  owner: string | null;
  auditor: string | null;
  dueDate: string | null;
  recommendation: string | null;
  aiReview: ReportFindingAiReview | null;
}

export interface ReportFindingEvidenceRef {
  documentId: string;
  filename: string;
  relation: string;
  location: string;
}

export interface ReportFindingAiReview {
  confidence: number;
  expected: string;
  observed: string;
  reason: string;
  controlClause: string;
  riskJustification: string;
  evidenceReferences: ReportFindingEvidenceRef[];
}

export interface ReportRiskRow {
  title: string;
  category: string | null;
  status: string;
  inherentImpact: number | null;
  inherentLikelihood: number | null;
  riskClass: string | null;
  treatment: string | null;
  owner: string | null;
}

export interface ReportData {
  locale: Locale;
  deliverable: ReportDeliverable;
  deliverableTitle: string;
  title: string;
  subsidiary: string | null;
  auditType: string | null;
  mode: string;
  state: string;
  periodStart: string | null;
  periodEnd: string | null;
  checklist: ReportChecklistRow[];
  findings: ReportFindingRow[];
  risks: ReportRiskRow[];
  generatedAt: string;
}

function findingAiReviewForReport(custom: unknown): ReportFindingAiReview | null {
  if (!custom || typeof custom !== 'object') return null;
  const ai = (custom as { ai?: unknown }).ai;
  if (!ai || typeof ai !== 'object') return null;
  const data = ai as {
    source?: unknown;
    decision?: unknown;
    confidence?: unknown;
    expected?: unknown;
    observed?: unknown;
    reason?: unknown;
    controlClause?: unknown;
    riskJustification?: unknown;
    evidenceReferences?: unknown;
  };
  if (data.source !== 'finding_suggestion' || data.decision !== 'accepted') return null;
  if (typeof data.confidence !== 'number') return null;

  const evidenceReferences = Array.isArray(data.evidenceReferences)
    ? data.evidenceReferences
        .map((ref) => {
          if (!ref || typeof ref !== 'object') return null;
          const row = ref as {
            documentId?: unknown;
            filename?: unknown;
            relation?: unknown;
            location?: unknown;
          };
          if (
            typeof row.documentId !== 'string' ||
            typeof row.filename !== 'string' ||
            typeof row.relation !== 'string' ||
            typeof row.location !== 'string'
          ) {
            return null;
          }
          return {
            documentId: row.documentId,
            filename: row.filename,
            relation: row.relation,
            location: row.location,
          };
        })
        .filter((ref): ref is ReportFindingEvidenceRef => ref !== null)
    : [];

  return {
    confidence: Math.max(0, Math.min(1, data.confidence)),
    expected: typeof data.expected === 'string' ? data.expected : '',
    observed: typeof data.observed === 'string' ? data.observed : '',
    reason: typeof data.reason === 'string' ? data.reason : '',
    controlClause: typeof data.controlClause === 'string' ? data.controlClause : '',
    riskJustification: typeof data.riskJustification === 'string' ? data.riskJustification : '',
    evidenceReferences,
  };
}

/** Сбор данных для отчёта engagement (T-045): шапка + чеклист-с-ответами + findings. */
@Injectable()
export class ReportDataService {
  constructor(private readonly dbService: DbService) {}

  async build(
    tenantId: string,
    engagementId: string,
    locale: Locale,
    deliverable: ReportDeliverable = 'audit_report',
  ): Promise<ReportData> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [eng] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);
      const [sub] = await tx.select().from(subsidiary).where(eq(subsidiary.id, eng.subsidiaryId));
      const [type] = eng.auditTypeId
        ? await tx.select().from(auditType).where(eq(auditType.id, eng.auditTypeId))
        : [null];

      const items = await tx
        .select()
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, engagementId))
        .orderBy(asc(checklistItem.order));
      const answers =
        items.length > 0
          ? await tx
              .select({
                id: response.id,
                checklistItemId: response.checklistItemId,
                text: response.text,
                compliance: response.complianceStatus,
              })
              .from(response)
              .where(
                inArray(
                  response.checklistItemId,
                  items.map((i) => i.id),
                ),
              )
          : [];
      const answerByItem = new Map(answers.map((a) => [a.checklistItemId, a]));

      const ownerMembership = alias(membership, 'owner_m');
      const ownerUser = alias(user, 'owner_u');
      const auditorMembership = alias(membership, 'auditor_m');
      const auditorUser = alias(user, 'auditor_u');
      const findings = await tx
        .select({
          titleI18n: finding.titleI18n,
          recommendationI18n: finding.recommendationI18n,
          riskRating: finding.riskRating,
          status: finding.status,
          dueDate: finding.dueDate,
          owner: ownerUser.fullName,
          auditor: auditorUser.fullName,
          custom: finding.custom,
        })
        .from(finding)
        .leftJoin(ownerMembership, eq(finding.ownerMembershipId, ownerMembership.id))
        .leftJoin(ownerUser, eq(ownerMembership.userId, ownerUser.id))
        .leftJoin(auditorMembership, eq(finding.auditorMembershipId, auditorMembership.id))
        .leftJoin(auditorUser, eq(auditorMembership.userId, auditorUser.id))
        .where(and(eq(finding.engagementId, engagementId), isNull(finding.deletedAt)))
        .orderBy(asc(finding.createdAt));

      const riskOwnerMembership = alias(membership, 'risk_owner_m');
      const riskOwnerUser = alias(user, 'risk_owner_u');
      const risks = await tx
        .select({
          titleI18n: risk.titleI18n,
          category: risk.category,
          status: risk.status,
          inherentImpact: risk.inherentImpact,
          inherentLikelihood: risk.inherentLikelihood,
          riskClass: risk.riskClass,
          treatment: risk.treatment,
          owner: riskOwnerUser.fullName,
        })
        .from(risk)
        .leftJoin(riskOwnerMembership, eq(risk.ownerMembershipId, riskOwnerMembership.id))
        .leftJoin(riskOwnerUser, eq(riskOwnerMembership.userId, riskOwnerUser.id))
        .where(and(eq(risk.tenantId, tenantId), isNull(risk.deletedAt)))
        .orderBy(asc(risk.createdAt));

      return {
        locale,
        deliverable,
        deliverableTitle: DELIVERABLE_LABELS[deliverable][locale],
        title: resolveLocalized(eng.titleI18n, locale),
        subsidiary: sub ? resolveLocalized(sub.nameI18n, locale) : null,
        auditType: type ? resolveLocalized(type.nameI18n, locale) : null,
        mode: eng.mode,
        state: eng.state,
        periodStart: eng.periodStart?.toISOString().slice(0, 10) ?? null,
        periodEnd: eng.periodEnd?.toISOString().slice(0, 10) ?? null,
        checklist: items.map((i) => {
          const a = answerByItem.get(i.id);
          return {
            ref: i.ref,
            question: resolveLocalized(i.questionI18n, locale),
            answer: a?.text ?? null,
            compliance: a?.compliance ?? null,
          };
        }),
        findings: findings.map((f) => ({
          title: resolveLocalized(f.titleI18n, locale),
          riskRating: f.riskRating,
          status: f.status,
          owner: f.owner,
          auditor: f.auditor,
          dueDate: f.dueDate?.toISOString().slice(0, 10) ?? null,
          recommendation: f.recommendationI18n
            ? resolveLocalized(f.recommendationI18n, locale)
            : null,
          aiReview: findingAiReviewForReport(f.custom),
        })),
        risks: risks.map((r) => ({
          title: resolveLocalized(r.titleI18n, locale),
          category: r.category,
          status: r.status,
          inherentImpact: r.inherentImpact,
          inherentLikelihood: r.inherentLikelihood,
          riskClass: r.riskClass,
          treatment: r.treatment,
          owner: r.owner,
        })),
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * T-H47: готовность пакета отчётности. Это pre-flight перед PDF/Word/Excel:
   * показывает, есть ли чеклист, ответы, findings, risks и evidence links.
   */
  async readiness(tenantId: string, engagementId: string, locale: Locale) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [eng] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);
      const [sub] = await tx.select().from(subsidiary).where(eq(subsidiary.id, eng.subsidiaryId));
      const [type] = eng.auditTypeId
        ? await tx.select().from(auditType).where(eq(auditType.id, eng.auditTypeId))
        : [null];

      const items = await tx
        .select({ id: checklistItem.id })
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, engagementId));
      const itemIds = items.map((i) => i.id);
      const answers =
        itemIds.length > 0
          ? await tx
              .select({ id: response.id, checklistItemId: response.checklistItemId })
              .from(response)
              .where(inArray(response.checklistItemId, itemIds))
          : [];
      const findings = await tx
        .select({ id: finding.id, status: finding.status, riskRating: finding.riskRating })
        .from(finding)
        .where(and(eq(finding.engagementId, engagementId), isNull(finding.deletedAt)));
      const risks = await tx
        .select({ id: risk.id })
        .from(risk)
        .where(and(eq(risk.tenantId, tenantId), isNull(risk.deletedAt)));

      const evidenceTargets = [engagementId, ...itemIds, ...answers.map((a) => a.id)];
      const evidence =
        evidenceTargets.length > 0
          ? await tx
              .select({ documentId: document.id })
              .from(documentLink)
              .innerJoin(document, eq(documentLink.documentId, document.id))
              .where(
                and(inArray(documentLink.entityId, evidenceTargets), isNull(document.deletedAt)),
              )
          : [];

      const checklistTotal = items.length;
      const answered = new Set(answers.map((a) => a.checklistItemId)).size;
      const findingsOpen = findings.filter((f) => f.status !== 'closed').length;
      const highRiskFindings = findings.filter((f) =>
        ['critical', 'high'].includes(f.riskRating),
      ).length;
      const evidenceLinks = new Set(evidence.map((e) => e.documentId)).size;
      const checks = [
        { key: 'scope', passed: Boolean(eng.periodStart || eng.periodEnd || type || sub) },
        { key: 'checklist', passed: checklistTotal > 0 },
        { key: 'responses', passed: checklistTotal > 0 && answered >= checklistTotal },
        { key: 'findings', passed: findings.length > 0 },
        { key: 'risks', passed: risks.length > 0 },
        { key: 'evidence', passed: evidenceLinks > 0 },
      ];
      const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);

      return {
        engagementId,
        title: resolveLocalized(eng.titleI18n, locale),
        subsidiary: sub ? resolveLocalized(sub.nameI18n, locale) : null,
        auditType: type ? resolveLocalized(type.nameI18n, locale) : null,
        state: eng.state,
        generatedAt: new Date().toISOString(),
        score,
        ready: score >= 80 && checklistTotal > 0,
        checklistTotal,
        answered,
        findings: findings.length,
        findingsOpen,
        highRiskFindings,
        risks: risks.length,
        evidenceLinks,
        checks,
      };
    });
  }

  async packageManifest(tenantId: string, engagementId: string, locale: Locale) {
    const readiness = await this.readiness(tenantId, engagementId, locale);
    return buildReportPackageManifest(engagementId, locale, readiness);
  }
}
