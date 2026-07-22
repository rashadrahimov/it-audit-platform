import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { CommentsSection } from '@/components/comments-section';
import { TasksSection, type TaskItem } from '@/components/tasks-section';
import { complianceStatusSchema } from '@it-audit/shared';
import {
  acceptEvidenceRequestAction,
  addChecklistItemsAction,
  assignEngagementMemberAction,
  createEvidenceRequestAction,
  createEvidenceRequestFromSuggestionAction,
  createFindingFromSuggestionAction,
  duplicateEngagementAction,
  provideEvidenceRequestAction,
  rejectFindingSuggestionAction,
  removeEngagementMemberAction,
  seedActionPlanFromRecommendationsAction,
  seedChecklistFromAuditTypeAction,
  saveResponseAction,
  transitionAction,
} from './actions';

export const dynamic = 'force-dynamic';

interface EngagementDetail {
  id: string;
  title: string;
  subsidiary: string | null;
  auditTypeId: string | null;
  auditType: string | null;
  mode: string;
  state: string;
  periodStart: string | null;
  periodEnd: string | null;
  allowedTransitions: string[];
  milestones: Array<{ stage: string; plannedDate: string | null; actualDate: string | null }>;
  domainProgressSummary: {
    totalDomains: number;
    completeDomains: number;
    totalControls: number;
    testedControls: number;
    exceptionControls: number;
    progressPercent: number;
  };
  domainProgress: Array<{
    domainCode: string | null;
    totalControls: number;
    testedControls: number;
    compliantControls: number;
    exceptionControls: number;
    notApplicableControls: number;
    progressPercent: number;
    complianceStatus: string;
    controls: Array<{
      id: string;
      ref: string;
      question: string;
      status: string;
    }>;
  }>;
  checklist: Array<{
    id: string;
    ref: string;
    domainCode: string | null;
    objective: string;
    question: string;
    status: string;
    controlId: string | null;
    response: {
      text: string;
      complianceStatus: string;
      submittedAt: string;
      respondent: string;
    } | null;
  }>;
}

interface LibraryControl {
  id: string;
  ref: string;
  objective: string;
}

interface FindingRow {
  id: string;
  title: string;
  riskRating: string;
  status: string;
  dueDate: string | null;
  owner: string | null;
  auditor: string | null;
  aiReview: {
    source: 'finding_suggestion';
    decision: 'accepted';
    confidence: number;
    expected: string;
    observed: string;
    draftTitle?: string;
    draftDescription?: string;
    draftRiskRating?: string;
    draftRecommendation?: string;
    reason?: string;
    controlClause?: string;
    riskJustification?: string;
    evidenceReferences: Array<{
      documentId: string;
      filename: string;
      relation: string;
      location: string;
    }>;
    reviewedAt: string;
    reviewedBy: string;
    editedFields: Array<{
      field: 'title' | 'description' | 'riskRating' | 'recommendation';
      draftValue: string | null;
      acceptedValue: string | null;
    }>;
  } | null;
}

interface EvidenceDoc {
  id: string;
  filename: string;
  version: number;
  relation: string;
  renewBy: string | null;
  status: string;
  owner: string | null;
}
interface EvidenceReview {
  status: string;
  reviewer: string | null;
  reviewedAt: string | null;
}
interface TeamMember {
  id: string;
  membershipId: string;
  engagementRole: string;
  stagePermissions: Record<string, string> | null;
  fullName: string;
  email: string;
}
interface TenantMember {
  id: string;
  fullName: string;
  email: string;
  status: string;
}
interface AuditTemplateItem {
  id: string;
  ref: string;
  order: number;
  objective: string;
  question: string;
}
interface EvidenceRequestRow {
  id: string;
  title: string;
  description: string | null;
  status: 'requested' | 'provided' | 'accepted';
  documentId: string | null;
  dueDate: string | null;
  assignee: string | null;
  createdAt: string;
}
interface EvidenceRequestList {
  open: number;
  total: number;
  items: EvidenceRequestRow[];
}
interface EvidenceRequestSuggestion {
  checklistItemId: string;
  ref: string;
  title: string;
  description: string;
  priority: 'high' | 'medium';
  reason: string;
  source: 'ai_drl';
  reviewRequired: true;
}
interface RecommendationTemplate {
  key: string;
  controlClause: string;
  riskRating: string;
  title: string;
  recommendation: string;
  ownerRole: string;
  suggestedDueDays: number;
  actionPlanReady: true;
  humanReviewRequired: true;
}

const ENGAGEMENT_ROLES = ['lead', 'assessor', 'reviewer', 'approver', 'observer'] as const;

const REVIEW_TONE: Record<string, string> = {
  not_ready: 'bg-muted text-secondary',
  ready: 'bg-emerald-100 text-emerald-700',
  flagged: 'bg-red-100 text-red-700',
  accepted: 'bg-emerald-100 text-emerald-700',
};

/** SLA-статус доказательства по дате обновления (T-V44). */
function slaStatus(renewBy: string | null, now: number): 'overdue' | 'soon' | 'ok' | 'none' {
  if (!renewBy) return 'none';
  const due = new Date(renewBy).getTime();
  if (due < now) return 'overdue';
  if (due < now + 30 * 24 * 60 * 60 * 1000) return 'soon';
  return 'ok';
}
const SLA_TONE: Record<string, string> = {
  overdue: 'bg-red-100 text-red-700',
  soon: 'bg-amber-100 text-amber-700',
  ok: 'bg-emerald-100 text-emerald-700',
  none: 'bg-muted text-secondary',
};
const COMPLIANCE_TONE: Record<string, string> = {
  compliant: 'bg-emerald-100 text-emerald-800',
  partially_compliant: 'bg-amber-100 text-amber-800',
  non_compliant: 'bg-red-100 text-red-800',
  not_applicable: 'bg-slate-100 text-slate-700',
  not_tested: 'bg-muted text-secondary',
};
const EVIDENCE_REQUEST_TONE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  provided: 'bg-teal-100 text-teal-800',
  accepted: 'bg-emerald-100 text-emerald-800',
};

/** Карточка engagement'а (T-035): состояние, переходы, вехи план/факт (ENG-03). */
export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const [t, tStates, locale, tenantSlug] = await Promise.all([
    getTranslations('engagementDetail'),
    getTranslations('engagementStates'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  if (!tenantSlug) redirect('/engagements');
  const tenantHeaders = { 'X-Tenant-Slug': tenantSlug };

  const res = await apiFetch(`/engagements/${id}?locale=${locale}`, {
    headers: tenantHeaders,
  });
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) throw new Error(`API /engagements/${id}: ${res.status}`);
  const eng: EngagementDetail = await res.json();
  const templateRes = eng.auditTypeId
    ? await apiFetch(`/audit-types/${eng.auditTypeId}/template-items?locale=${locale}`, {
        headers: tenantHeaders,
      })
    : null;
  const auditTemplateItems: AuditTemplateItem[] =
    templateRes && templateRes.ok ? await templateRes.json() : [];

  // библиотека для формы добавления — без уже включённых контролей
  const libRes = await apiFetch(`/controls?locale=${locale}&tenantSlug=${tenantSlug}`);
  const library: LibraryControl[] = libRes.ok ? await libRes.json() : [];
  const inChecklist = new Set(eng.checklist.map((i) => i.controlId).filter(Boolean));
  const addable = library.filter((c) => !inChecklist.has(c.id));

  const fRes = await apiFetch(`/findings?engagementId=${id}&locale=${locale}`, {
    headers: tenantHeaders,
  });
  const findings: FindingRow[] = fRes.ok ? await fRes.json() : [];

  // SEC/EP-AI (T-H15): детерминированные предложения findings по гэпам
  const sRes = await apiFetch(`/engagements/${id}/finding-suggestions?locale=${locale}`, {
    headers: tenantHeaders,
  });
  const suggestions: Array<{
    checklistItemId: string;
    ref: string | null;
    suggestedTitle: string;
    suggestedRisk: string;
    reason: string;
    expected: string;
    observed: string;
    controlClause: string;
    riskJustification: string;
    suggestedRecommendation: string;
    confidence: number;
    evidenceReferences: Array<{
      documentId: string;
      filename: string;
      relation: string;
      location: string;
    }>;
    aiDraft: boolean;
    reviewRequired: boolean;
  }> = sRes.ok ? (await sRes.json()).suggestions : [];

  // T-V10: комментарии аудита (полиморфный API T-023)
  const cRes = await apiFetch(`/comments?entityType=engagement&entityId=${id}`, {
    headers: tenantHeaders,
  });
  const comments: Array<{ author: string; body: string; at: string }> = cRes.ok
    ? await cRes.json()
    : [];

  // T-V44: доказательства аудита (документы по привязке) + статус ревью (T-V29)
  const evRes = await apiFetch(`/documents?entityType=engagement&entityId=${id}`, {
    headers: tenantHeaders,
  });
  const evidence: EvidenceDoc[] = evRes.ok ? await evRes.json() : [];
  const revRes =
    evidence.length > 0
      ? await apiFetch(
          `/audit-firms/evidence-batch?entityType=document&entityIds=${evidence.map((d) => d.id).join(',')}`,
          { headers: tenantHeaders },
        )
      : null;
  const reviews: Record<string, EvidenceReview> = revRes && revRes.ok ? await revRes.json() : {};
  const [teamRes, membersRes, taskRes, requestRes, requestSuggestionRes, recommendationTplRes] =
    await Promise.all([
      apiFetch(`/engagements/${id}/members`, { headers: tenantHeaders }),
      apiFetch(`/memberships?locale=${locale}`, { headers: tenantHeaders }),
      apiFetch(`/tasks?entityType=engagement&entityId=${id}`, { headers: tenantHeaders }),
      apiFetch(`/evidence-requests?engagementId=${id}`, { headers: tenantHeaders }),
      apiFetch(`/evidence-requests/suggestions?engagementId=${id}&locale=${locale}`, {
        headers: tenantHeaders,
      }),
      apiFetch(`/tasks/recommendation-templates?locale=${locale}`, { headers: tenantHeaders }),
    ]);
  const team: TeamMember[] = teamRes.ok ? await teamRes.json() : [];
  const tenantMembers: TenantMember[] = membersRes.ok ? await membersRes.json() : [];
  const auditTasks: TaskItem[] = taskRes.ok ? await taskRes.json() : [];
  const evidenceRequests: EvidenceRequestList = requestRes.ok
    ? await requestRes.json()
    : { open: 0, total: 0, items: [] };
  const evidenceRequestSuggestions: EvidenceRequestSuggestion[] = requestSuggestionRes.ok
    ? (await requestSuggestionRes.json()).items
    : [];
  const recommendationTemplates: RecommendationTemplate[] = recommendationTplRes.ok
    ? (await recommendationTplRes.json()).templates
    : [];

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const fmt = (iso: string | null): string => (iso ? dateFmt.format(new Date(iso)) : '—');
  const now = Date.now();
  const assignedMembershipIds = new Set(team.map((m) => m.membershipId));
  const assignableMembers = tenantMembers.filter(
    (m) => m.status === 'active' && !assignedMembershipIds.has(m.id),
  );
  const taskAssignees =
    team.length > 0
      ? team.map((m) => ({ id: m.membershipId, fullName: m.fullName }))
      : tenantMembers
          .filter((m) => m.status === 'active')
          .map((m) => ({ id: m.id, fullName: m.fullName }));
  const openAuditTasks = auditTasks.filter((task) => task.status !== 'done').length;
  const overdueAuditTasks = auditTasks.filter(
    (task) =>
      task.status !== 'done' && task.dueDate !== null && new Date(task.dueDate).getTime() < now,
  ).length;
  const checklistRefs = new Set(eng.checklist.map((item) => item.ref));
  const seedableTemplateCount = auditTemplateItems.filter(
    (item) => !checklistRefs.has(item.ref),
  ).length;
  const overdueEvidenceRequests = evidenceRequests.items.filter(
    (request) =>
      request.status !== 'accepted' &&
      request.dueDate !== null &&
      new Date(request.dueDate).getTime() < now,
  ).length;
  const acceptedAiFindings = findings.filter((finding) => finding.aiReview !== null);
  const aiEvidenceDocumentIds = new Set<string>();
  for (const suggestion of suggestions) {
    for (const ev of suggestion.evidenceReferences) aiEvidenceDocumentIds.add(ev.documentId);
  }
  for (const finding of acceptedAiFindings) {
    for (const ev of finding.aiReview?.evidenceReferences ?? []) {
      aiEvidenceDocumentIds.add(ev.documentId);
    }
  }
  const evidencedSuggestions = suggestions.filter(
    (suggestion) => suggestion.evidenceReferences.length > 0,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{eng.title}</h1>
        <Link
          href="/engagements"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('back')}
        </Link>
      </div>

      <section
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="engagement-export"
      >
        <span className="mr-1 text-xs font-medium tracking-wide text-secondary uppercase">
          {t('export')}
        </span>
        {(['pdf', 'docx', 'xlsx', 'csv', 'xml'] as const).map((fmt) => (
          <a
            key={fmt}
            href={`/engagements/${eng.id}/report?format=${fmt}&locale=${locale}`}
            data-testid={`export-${fmt}`}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {fmt.toUpperCase()}
          </a>
        ))}
        <form action={duplicateEngagementAction.bind(null, eng.id)} className="ml-auto">
          <button
            type="submit"
            data-testid="engagement-duplicate"
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('duplicate')}
          </button>
        </form>
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_18px_55px_rgba(6,78,59,0.12)]"
        data-testid="audit-charter"
      >
        <div className="border-b border-emerald-100 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.18),transparent_34%),linear-gradient(135deg,#f0fdfa,#ffffff)] p-5">
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-700 uppercase">
            {t('charter.kicker')}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-primary">{t('charter.title')}</h2>
              <p className="mt-1 max-w-3xl text-sm text-secondary">{t('charter.subtitle')}</p>
            </div>
            <span className="rounded-full bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white">
              {t(`modes.${eng.mode}`)}
            </span>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              key: 'scope',
              value: eng.subsidiary ?? '—',
              hint: eng.auditType ?? t('charter.noAuditType'),
            },
            {
              key: 'criteria',
              value: eng.domainProgressSummary.totalControls,
              hint: t('charter.criteriaHint', {
                domains: eng.domainProgressSummary.totalDomains,
                tested: eng.domainProgressSummary.testedControls,
              }),
            },
            {
              key: 'period',
              value:
                eng.periodStart || eng.periodEnd
                  ? `${eng.periodStart ? fmt(eng.periodStart) : '—'} → ${
                      eng.periodEnd ? fmt(eng.periodEnd) : '—'
                    }`
                  : t('charter.noPeriod'),
              hint: t('charter.periodHint'),
            },
            {
              key: 'team',
              value: team.length,
              hint: t('charter.teamHint', { tasks: openAuditTasks }),
            },
          ].map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf8)] p-4"
            >
              <div className="text-xs font-semibold tracking-wide text-secondary uppercase">
                {t(`charter.cards.${item.key}`)}
              </div>
              <div className="mt-2 text-lg font-bold text-primary">{item.value}</div>
              <div className="mt-1 text-xs text-secondary">{item.hint}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 border-t border-border p-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h3 className="text-sm font-semibold text-primary">{t('charter.workflowTitle')}</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              {['scoping', 'data_collection', 'assessment', 'findings', 'reporting'].map(
                (phase, index) => (
                  <div key={phase} className="rounded-xl bg-muted/60 p-3 text-xs">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">
                      {index + 1}
                    </div>
                    <div className="mt-2 font-semibold text-primary">
                      {t(`charter.phases.${phase}`)}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50/70 p-4">
            <h3 className="text-sm font-semibold text-primary">{t('charter.deliverablesTitle')}</h3>
            <p className="mt-2 text-sm text-secondary">{t('charter.deliverablesBody')}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['PDF', 'DOCX', 'XLSX', 'EN', 'AZ', 'RU'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_18px_55px_rgba(6,78,59,0.12)]"
        data-testid="ai-traceability-trail"
      >
        <div className="border-b border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_36%),linear-gradient(135deg,#ecfdf5,#ffffff)] p-5">
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-700 uppercase">
            {t('trace.kicker')}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-primary">{t('trace.title')}</h2>
              <p className="mt-1 max-w-3xl text-sm text-secondary">{t('trace.subtitle')}</p>
            </div>
            <div className="rounded-2xl bg-emerald-950 px-4 py-3 text-center text-white shadow-lg shadow-emerald-950/15">
              <div className="text-2xl font-bold">{acceptedAiFindings.length}</div>
              <div className="text-xs text-emerald-100">{t('trace.accepted')}</div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-4">
          {[
            {
              key: 'evidence',
              value: aiEvidenceDocumentIds.size,
              hintValue: evidence.length,
            },
            {
              key: 'drafts',
              value: suggestions.length,
              hintValue: evidencedSuggestions.length,
            },
            {
              key: 'review',
              value: acceptedAiFindings.length,
              hintValue: acceptedAiFindings.filter((f) => f.aiReview?.reviewedBy).length,
            },
            {
              key: 'report',
              value: findings.length,
              hintValue: findings.filter((f) => f.status !== 'resolved').length,
            },
          ].map((step) => (
            <div
              key={step.key}
              className="rounded-xl border border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf8)] p-4"
            >
              <div className="text-xs font-semibold tracking-wide text-secondary uppercase">
                {t(`trace.steps.${step.key}.label`)}
              </div>
              <div className="mt-2 text-2xl font-bold text-primary">{step.value}</div>
              <div className="mt-1 text-xs text-secondary">
                {t(`trace.steps.${step.key}.hint`, { count: step.hintValue })}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 border-t border-border p-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl bg-emerald-50/70 p-4">
            <h3 className="text-sm font-semibold text-primary">{t('trace.policyTitle')}</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-secondary">
              {(['grounded', 'draftOnly', 'human', 'report'] as const).map((key) => (
                <li key={key} className="flex gap-2">
                  <span className="mt-0.5 text-emerald-700">✓</span>
                  <span>{t(`trace.policy.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary">{t('trace.acceptedTitle')}</h3>
            <div className="mt-3 flex flex-col gap-2">
              {acceptedAiFindings.length > 0 ? (
                acceptedAiFindings.slice(0, 4).map((finding) => (
                  <div
                    key={finding.id}
                    className="rounded-xl bg-muted/60 px-3 py-2 text-sm"
                    data-testid="ai-trace-accepted-finding"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{finding.title}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(finding.aiReview?.editedFields.length ?? 0) > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            {t('trace.editedFields', {
                              count: finding.aiReview?.editedFields.length ?? 0,
                            })}
                          </span>
                        )}
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          {Math.round((finding.aiReview?.confidence ?? 0) * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-secondary">
                      {t('trace.reviewedBy', {
                        user: finding.aiReview?.reviewedBy ?? '—',
                        date: finding.aiReview?.reviewedAt ? fmt(finding.aiReview.reviewedAt) : '—',
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(finding.aiReview?.evidenceReferences ?? []).length > 0 ? (
                        (finding.aiReview?.evidenceReferences ?? []).slice(0, 3).map((ev) => (
                          <span
                            key={`${finding.id}-${ev.documentId}-${ev.location}`}
                            className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-secondary"
                          >
                            {ev.filename} · {ev.location}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
                          {t('noEvidenceRef')}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-muted/60 px-3 py-3 text-sm text-secondary">
                  {t('trace.noAccepted')}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
          data-testid="finding-suggestions"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                {t('suggestionsKicker')}
              </p>
              <h2 className="text-sm font-semibold text-emerald-950">
                {t('suggestions')} ({suggestions.length})
              </h2>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
              {t('reviewRequired')}
            </span>
          </div>
          <ul className="flex flex-col gap-3">
            {suggestions.map((s) => {
              const draftDescription = [
                s.reason,
                s.expected,
                s.observed,
                ...s.evidenceReferences.map((ev) => `${ev.filename} (${ev.location})`),
              ].join('\n');
              const explainabilityReason = t('explainability.reasoningValue', {
                clause: s.controlClause,
              });
              const riskJustification = t('explainability.riskJustificationValue', {
                risk: t(`risk.${s.suggestedRisk}`),
              });
              const canAcceptAiFinding = s.evidenceReferences.length > 0;

              return (
                <li
                  key={s.checklistItemId}
                  className="rounded-xl border border-emerald-200/80 bg-white p-3 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{s.suggestedTitle}</p>
                      <p className="mt-1 text-xs text-secondary">
                        {t('confidence')}: {Math.round(s.confidence * 100)}%
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.suggestedRisk === 'high'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {t(`risk.${s.suggestedRisk}`)}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <dt className="font-semibold text-secondary">{t('expected')}</dt>
                      <dd className="mt-1 text-foreground">{s.expected}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <dt className="font-semibold text-secondary">{t('observed')}</dt>
                      <dd className="mt-1 text-foreground">{s.observed}</dd>
                    </div>
                  </dl>
                  <div
                    className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3"
                    data-testid="ai-finding-explainability"
                  >
                    <p className="text-xs font-semibold tracking-[0.12em] text-emerald-700 uppercase">
                      {t('explainability.kicker')}
                    </p>
                    <dl className="mt-2 grid gap-2 text-xs md:grid-cols-3">
                      <div>
                        <dt className="font-semibold text-secondary">
                          {t('explainability.controlClause')}
                        </dt>
                        <dd className="mt-1 text-foreground">{s.controlClause}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-secondary">
                          {t('explainability.reasoning')}
                        </dt>
                        <dd className="mt-1 text-foreground">{explainabilityReason}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-secondary">
                          {t('explainability.riskJustification')}
                        </dt>
                        <dd className="mt-1 text-foreground">{riskJustification}</dd>
                      </div>
                    </dl>
                  </div>
                  <form
                    action={createFindingFromSuggestionAction.bind(
                      null,
                      id,
                      s.checklistItemId,
                      s.suggestedTitle,
                      s.suggestedRisk,
                      draftDescription,
                      s.expected,
                      s.observed,
                      explainabilityReason,
                      s.controlClause,
                      riskJustification,
                      s.suggestedRecommendation,
                      s.confidence,
                      JSON.stringify(s.evidenceReferences),
                    )}
                    className="mt-3 grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3"
                  >
                    <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                      <label className="grid gap-1 text-xs">
                        <span className="font-semibold text-secondary">
                          {t('reviewDraftTitle')}
                        </span>
                        <input
                          name="title"
                          defaultValue={s.suggestedTitle}
                          className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        />
                      </label>
                      <label className="grid gap-1 text-xs">
                        <span className="font-semibold text-secondary">{t('reviewDraftRisk')}</span>
                        <select
                          name="riskRating"
                          defaultValue={s.suggestedRisk}
                          className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <option value="medium">{t('risk.medium')}</option>
                          <option value="high">{t('risk.high')}</option>
                        </select>
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs">
                      <span className="font-semibold text-secondary">
                        {t('reviewDraftDescription')}
                      </span>
                      <textarea
                        name="description"
                        defaultValue={draftDescription}
                        rows={4}
                        className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      <span className="font-semibold text-secondary">
                        {t('reviewDraftRecommendation')}
                      </span>
                      <textarea
                        name="recommendation"
                        defaultValue={s.suggestedRecommendation}
                        rows={3}
                        className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {s.evidenceReferences.length > 0 ? (
                          s.evidenceReferences.map((ev) => (
                            <span
                              key={`${s.checklistItemId}-${ev.documentId}-${ev.location}`}
                              className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-800"
                            >
                              {ev.filename} · {ev.location}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
                            {t('noEvidenceRef')}
                          </span>
                        )}
                      </div>
                      <button
                        type="submit"
                        data-testid="suggestion-create-finding"
                        disabled={!canAcceptAiFinding}
                        title={!canAcceptAiFinding ? t('evidenceRequiredToAccept') : undefined}
                        className={
                          canAcceptAiFinding
                            ? 'rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-ring'
                            : 'cursor-not-allowed rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 opacity-75'
                        }
                      >
                        {canAcceptAiFinding ? t('suggestionCreate') : t('evidenceRequiredToAccept')}
                      </button>
                    </div>
                  </form>
                  <form
                    action={rejectFindingSuggestionAction.bind(null, id, s.checklistItemId)}
                    className="mt-2 flex justify-end"
                  >
                    <button
                      type="submit"
                      data-testid="suggestion-reject-finding"
                      className="rounded-md border border-muted-foreground/20 px-2.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('suggestionReject')}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section
        className="rounded-xl border border-border bg-white p-6 shadow-sm"
        data-testid="engagement-detail"
      >
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('subsidiary')}
            </dt>
            <dd className="text-foreground">{eng.subsidiary ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('auditType')}
            </dt>
            <dd className="text-foreground">{eng.auditType ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('mode')}
            </dt>
            <dd className="text-foreground">{t(`modes.${eng.mode}`)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('state')}
            </dt>
            <dd>
              <span
                data-testid="engagement-state"
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary"
              >
                {tStates(eng.state)}
              </span>
            </dd>
          </div>
        </dl>
        {eng.allowedTransitions.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {eng.allowedTransitions.map((to) => (
              <form key={to} action={transitionAction.bind(null, eng.id, to)}>
                <button
                  type="submit"
                  data-testid={`transition-${to}`}
                  className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  → {tStates(to)}
                </button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
        data-testid="engagement-domain-progress"
      >
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700 uppercase">
            {t('domainProgressKicker')}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary">{t('domainProgress')}</h2>
              <p className="mt-1 max-w-2xl text-sm text-secondary">{t('domainProgressSub')}</p>
            </div>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold text-white shadow-sm">
              {eng.domainProgressSummary.progressPercent}%
            </span>
          </div>
        </div>
        <div className="p-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-medium tracking-wide text-secondary uppercase">
                {t('domainCoverage')}
              </p>
              <p className="mt-2 text-2xl font-bold text-primary">
                {eng.domainProgressSummary.completeDomains}/{eng.domainProgressSummary.totalDomains}
              </p>
              <p className="mt-1 text-xs text-secondary">{t('domainCoverageHint')}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-medium tracking-wide text-secondary uppercase">
                {t('testedControls')}
              </p>
              <p className="mt-2 text-2xl font-bold text-primary">
                {eng.domainProgressSummary.testedControls}/{eng.domainProgressSummary.totalControls}
              </p>
              <p className="mt-1 text-xs text-secondary">{t('testedControlsHint')}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-medium tracking-wide text-secondary uppercase">
                {t('domainExceptions')}
              </p>
              <p className="mt-2 text-2xl font-bold text-primary">
                {eng.domainProgressSummary.exceptionControls}
              </p>
              <p className="mt-1 text-xs text-secondary">{t('domainExceptionsHint')}</p>
            </div>
          </div>

          {eng.domainProgress.length === 0 ? (
            <p className="mt-5 text-sm text-secondary">{t('noDomainProgress')}</p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {eng.domainProgress.map((domain) => (
                <article
                  key={domain.domainCode ?? 'uncategorized'}
                  className="rounded-2xl border border-border bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium tracking-wide text-secondary uppercase">
                        {t('domain')}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-primary">
                        {domain.domainCode ?? t('uncategorizedDomain')}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                        COMPLIANCE_TONE[domain.complianceStatus] ?? COMPLIANCE_TONE.not_tested
                      }`}
                    >
                      {t(`compliance.${domain.complianceStatus}`)}
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{ width: `${domain.progressPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-secondary">
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      {t('tested')}: {domain.testedControls}/{domain.totalControls}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      {t('exceptions')}: {domain.exceptionControls}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      {domain.progressPercent}%
                    </span>
                  </div>
                  <ul className="mt-4 flex flex-col gap-2">
                    {domain.controls.slice(0, 4).map((control) => (
                      <li
                        key={control.id}
                        className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-2"
                      >
                        <div>
                          <p className="text-xs font-semibold text-foreground">{control.ref}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-secondary">
                            {control.question}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                            COMPLIANCE_TONE[control.status] ?? COMPLIANCE_TONE.not_tested
                          }`}
                        >
                          {t(`compliance.${control.status}`)}
                        </span>
                      </li>
                    ))}
                    {domain.controls.length > 4 && (
                      <li className="text-xs text-secondary">
                        +{domain.controls.length - 4} {t('moreControls')}
                      </li>
                    )}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-white p-6 shadow-sm"
        data-testid="engagement-team-accountability"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700 uppercase">
              {t('teamKicker')}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-primary">{t('teamTitle')}</h2>
            <p className="mt-1 max-w-2xl text-sm text-secondary">{t('teamSub')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-lg font-bold text-primary">{team.length}</p>
              <p className="text-[11px] font-medium text-secondary">{t('teamMembers')}</p>
            </div>
            <div className="rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-lg font-bold text-primary">{openAuditTasks}</p>
              <p className="text-[11px] font-medium text-secondary">{t('activeAuditTasks')}</p>
            </div>
            <div className="rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-lg font-bold text-primary">{overdueAuditTasks}</p>
              <p className="text-[11px] font-medium text-secondary">{t('overdueAuditTasks')}</p>
            </div>
          </div>
        </div>

        {team.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted/60 p-4 text-sm text-secondary">{t('teamEmpty')}</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {team.map((member) => (
              <li
                key={member.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{member.fullName}</p>
                  <p className="truncate text-xs text-secondary">{member.email}</p>
                  <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {t(`roles.${member.engagementRole}`)}
                  </span>
                </div>
                <form action={removeEngagementMemberAction.bind(null, eng.id, member.id)}>
                  <button
                    type="submit"
                    data-testid="engagement-member-remove"
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t('removeMember')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {assignableMembers.length > 0 && (
          <details className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-accent">
              {t('addTeamMember')}
            </summary>
            <form
              action={assignEngagementMemberAction.bind(null, eng.id)}
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-secondary">{t('memberLabel')}</span>
                <select
                  name="membershipId"
                  required
                  data-testid="engagement-member-select"
                  className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {assignableMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName} · {member.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-secondary">{t('roleLabel')}</span>
                <select
                  name="engagementRole"
                  required
                  data-testid="engagement-role-select"
                  className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ENGAGEMENT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`roles.${role}`)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                data-testid="engagement-member-add"
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('addMember')}
              </button>
            </form>
          </details>
        )}
      </section>

      <TasksSection
        entityType="engagement"
        entityId={eng.id}
        path={`/engagements/${eng.id}`}
        tasks={auditTasks}
        members={taskAssignees}
        testid="engagement-audit-tasks"
        title={t('auditTasks')}
      />

      <section
        className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
        data-testid="engagement-evidence-requests"
      >
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700 uppercase">
                {t('evidenceRequestsKicker')}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-primary">
                {t('evidenceRequestsTitle')}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-secondary">{t('evidenceRequestsSub')}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                <p className="text-lg font-bold text-primary">{evidenceRequests.open}</p>
                <p className="text-[11px] font-medium text-secondary">
                  {t('evidenceRequestsOpen')}
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                <p className="text-lg font-bold text-primary">
                  {evidenceRequestSuggestions.length}
                </p>
                <p className="text-[11px] font-medium text-secondary">
                  {t('evidenceRequestsSuggested')}
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                <p className="text-lg font-bold text-primary">{overdueEvidenceRequests}</p>
                <p className="text-[11px] font-medium text-secondary">
                  {t('evidenceRequestsOverdue')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="flex flex-col gap-4">
            {evidenceRequests.items.length === 0 ? (
              <p className="rounded-xl bg-muted/60 p-4 text-sm text-secondary">
                {t('evidenceRequestsEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {evidenceRequests.items.map((request) => (
                  <li
                    key={request.id}
                    className="rounded-xl border border-border bg-muted/20 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{request.title}</p>
                        {request.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-secondary">
                            {request.description.replace(/^AI-DRL:[^\n]+\n*/u, '').trim()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                          EVIDENCE_REQUEST_TONE[request.status]
                        }`}
                      >
                        {t(`evidenceRequestStatus.${request.status}`)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-secondary">
                      <span className="rounded-full bg-white px-2.5 py-1">
                        {t('evidenceRequestAssignee')}: {request.assignee ?? '—'}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1">
                        {t('evidenceRequestDue')}: {fmt(request.dueDate)}
                      </span>
                      {request.documentId && (
                        <a
                          href={`/documents/${request.documentId}/download`}
                          className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 underline-offset-2 hover:underline"
                        >
                          {t('linkedDocument')}
                        </a>
                      )}
                    </div>
                    {request.status === 'provided' && (
                      <form
                        action={acceptEvidenceRequestAction.bind(null, eng.id, request.id)}
                        className="mt-3"
                      >
                        <button
                          type="submit"
                          data-testid="accept-evidence-request"
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {t('acceptRequest')}
                        </button>
                      </form>
                    )}
                    {request.status === 'requested' && evidence.length > 0 && (
                      <details className="mt-3 rounded-lg border border-border bg-white p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-accent">
                          {t('provideRequestEvidence')}
                        </summary>
                        <form
                          action={provideEvidenceRequestAction.bind(null, eng.id, request.id)}
                          className="mt-3 flex flex-wrap items-end gap-2"
                        >
                          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs">
                            <span className="font-medium text-secondary">
                              {t('provideRequestEvidenceLabel')}
                            </span>
                            <select
                              name="documentId"
                              required
                              data-testid="provide-evidence-request-document"
                              className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {evidence.map((doc) => (
                                <option key={doc.id} value={doc.id}>
                                  {doc.filename} · v{doc.version}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="submit"
                            data-testid="provide-evidence-request"
                            className="rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 transition-colors duration-150 hover:bg-teal-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {t('provideRequestEvidenceSubmit')}
                          </button>
                        </form>
                      </details>
                    )}
                    {request.status === 'requested' && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
                        <p className="text-xs text-emerald-950/80">
                          {evidence.length > 0
                            ? t('uploadRequestEvidenceHint')
                            : t('uploadRequestEvidenceEmptyHint')}
                        </p>
                        <Link
                          href={`/documents?entityType=engagement&entityId=${eng.id}#document-upload`}
                          data-testid="upload-evidence-request"
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {t('uploadRequestEvidence')}
                        </Link>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {evidenceRequestSuggestions.length > 0 && (
              <details className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4" open>
                <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
                  {t('drlSuggestions')} ({evidenceRequestSuggestions.length})
                </summary>
                <p className="mt-2 text-xs text-emerald-900/75">{t('drlSuggestionHint')}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {evidenceRequestSuggestions.slice(0, 6).map((suggestion) => (
                    <li
                      key={suggestion.checklistItemId}
                      className="rounded-lg border border-emerald-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {suggestion.title}
                          </p>
                          <p className="mt-1 text-xs text-secondary">{suggestion.reason}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            suggestion.priority === 'high'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {t(`risk.${suggestion.priority}`)}
                        </span>
                      </div>
                      <form
                        action={createEvidenceRequestFromSuggestionAction.bind(
                          null,
                          eng.id,
                          suggestion.checklistItemId,
                          suggestion.title,
                          suggestion.description,
                          suggestion.reason,
                        )}
                        className="mt-3"
                      >
                        <button
                          type="submit"
                          data-testid="create-evidence-request-suggestion"
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {t('createRequest')}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <details className="h-fit rounded-xl border border-border bg-muted/20 p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-accent">
              {t('evidenceRequestCreate')}
            </summary>
            <form
              action={createEvidenceRequestAction.bind(null, eng.id)}
              className="mt-3 flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-secondary">
                  {t('evidenceRequestTitleLabel')}
                </span>
                <input
                  name="title"
                  required
                  data-testid="evidence-request-title"
                  placeholder={t('evidenceRequestTitlePh')}
                  className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-secondary">
                  {t('evidenceRequestDescriptionLabel')}
                </span>
                <textarea
                  name="description"
                  rows={3}
                  data-testid="evidence-request-description"
                  className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-secondary">
                  {t('evidenceRequestAssignee')}
                </span>
                <select
                  name="assigneeMembershipId"
                  data-testid="evidence-request-assignee"
                  className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">—</option>
                  {taskAssignees.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-secondary">
                  {t('evidenceRequestDue')}
                </span>
                <input
                  name="dueDate"
                  type="date"
                  data-testid="evidence-request-due"
                  className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <button
                type="submit"
                data-testid="create-evidence-request"
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('evidenceRequestSubmit')}
              </button>
            </form>
          </details>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('checklist')}</h2>
        {auditTemplateItems.length > 0 && (
          <div
            className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
            data-testid="audit-type-template"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                  {t('templateKicker')}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-emerald-950">
                  {t('templateTitle')}
                </h3>
                <p className="mt-1 text-xs text-emerald-900/75">
                  {t('templateHint', {
                    total: auditTemplateItems.length,
                    seedable: seedableTemplateCount,
                  })}
                </p>
              </div>
              {seedableTemplateCount > 0 && (
                <form action={seedChecklistFromAuditTypeAction.bind(null, eng.id)}>
                  <button
                    type="submit"
                    data-testid="seed-checklist-template"
                    className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t('seedChecklist')}
                  </button>
                </form>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {auditTemplateItems.slice(0, 8).map((item) => (
                <span
                  key={item.id}
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    checklistRefs.has(item.ref)
                      ? 'bg-white text-emerald-800'
                      : 'bg-emerald-600 text-white'
                  }`}
                  title={item.question}
                >
                  {item.ref}
                </span>
              ))}
              {auditTemplateItems.length > 8 && (
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800">
                  +{auditTemplateItems.length - 8}
                </span>
              )}
            </div>
          </div>
        )}
        {eng.checklist.length === 0 ? (
          <p className="text-sm text-secondary">{t('checklistEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-80 text-left text-sm" data-testid="engagement-checklist">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="py-2 pr-4 font-medium">{t('checklistRef')}</th>
                  <th className="py-2 pr-4 font-medium">{t('checklistQuestion')}</th>
                  <th className="py-2 font-medium">{t('checklistStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {eng.checklist.map((item) => (
                  <tr key={item.id} className="border-b border-border align-top last:border-0">
                    <td className="py-2 pr-4 font-medium whitespace-nowrap text-foreground">
                      {item.ref}
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {item.question}
                      {item.response && (
                        <p
                          data-testid={`response-${item.ref}`}
                          className="mt-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-secondary"
                        >
                          <span className="font-medium text-foreground">
                            {item.response.respondent}:
                          </span>{' '}
                          {item.response.text}
                        </p>
                      )}
                    </td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                          COMPLIANCE_TONE[
                            item.response ? item.response.complianceStatus : 'not_tested'
                          ]
                        }`}
                      >
                        {item.response
                          ? t(`compliance.${item.response.complianceStatus}`)
                          : t('compliance.not_tested')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {eng.checklist.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-accent">
              {t('respond')}
            </summary>
            <form
              action={saveResponseAction.bind(null, eng.id)}
              className="mt-3 flex flex-col gap-3"
            >
              <select
                name="itemId"
                required
                data-testid="respond-item"
                className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {eng.checklist.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.ref} — {item.question.slice(0, 80)}
                  </option>
                ))}
              </select>
              <textarea
                name="text"
                required
                rows={3}
                data-testid="respond-text"
                placeholder={t('respondPlaceholder')}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <select
                name="complianceStatus"
                required
                data-testid="respond-status"
                className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {complianceStatusSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {t(`compliance.${s}`)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                data-testid="respond-submit"
                className="cursor-pointer self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('respondSubmit')}
              </button>
            </form>
          </details>
        )}
        {addable.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-accent">
              {t('checklistAdd')}
            </summary>
            <form
              action={addChecklistItemsAction.bind(null, eng.id)}
              className="mt-3 flex flex-col gap-3"
            >
              <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-3">
                {addable.map((c) => (
                  <label key={c.id} className="flex items-baseline gap-2 text-sm">
                    <input type="checkbox" name="controlId" value={c.id} />
                    <span className="font-medium whitespace-nowrap text-foreground">{c.ref}</span>
                    <span className="text-secondary">{c.objective}</span>
                  </label>
                ))}
              </div>
              <button
                type="submit"
                data-testid="add-checklist-items"
                className="cursor-pointer self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('checklistSubmit')}
              </button>
            </form>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-primary">{t('findings')}</h2>
            <p className="mt-1 text-xs text-secondary">{t('actionPlanHint')}</p>
          </div>
          {findings.length > 0 && (
            <form action={seedActionPlanFromRecommendationsAction.bind(null, eng.id)}>
              <button
                type="submit"
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                data-testid="seed-action-plan"
              >
                {t('seedActionPlan')}
              </button>
            </form>
          )}
        </div>
        <div
          className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3"
          data-testid="action-plan-recommendation-proof"
        >
          <p className="text-[11px] font-semibold tracking-[0.18em] text-emerald-800 uppercase">
            {t('actionPlanProof.kicker')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {[
              t('actionPlanProof.owner'),
              t('actionPlanProof.timeline'),
              t('actionPlanProof.clause'),
              t('actionPlanProof.review'),
            ].map((label) => (
              <span
                key={label}
                className="rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1 font-medium text-emerald-900 shadow-sm"
              >
                {label}
              </span>
            ))}
          </div>
          {recommendationTemplates.length > 0 && (
            <div
              className="mt-3 grid gap-2 border-t border-emerald-200/70 pt-3 sm:grid-cols-3"
              data-testid="recommendation-template-proof"
            >
              {recommendationTemplates.slice(0, 3).map((template) => (
                <div key={template.key} className="rounded-xl bg-white/85 p-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-primary">{template.title}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      {template.controlClause}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-secondary">
                    {template.recommendation}
                  </p>
                  <p className="mt-2 text-[11px] font-medium text-emerald-900">
                    {t('actionPlanProof.templateMeta', {
                      owner: template.ownerRole,
                      days: template.suggestedDueDays,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        {findings.length === 0 ? (
          <p className="text-sm text-secondary">{t('findingsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[22rem] text-left text-sm"
              data-testid="engagement-findings"
            >
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="py-2 pr-4 font-medium">{t('findingTitle')}</th>
                  <th className="py-2 pr-4 font-medium">{t('findingRating')}</th>
                  <th className="py-2 pr-4 font-medium">{t('findingOwner')}</th>
                  <th className="py-2 font-medium">{t('findingDue')}</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.id} className="border-b border-border align-top last:border-0">
                    <td className="py-2 pr-4 text-foreground">
                      <div className="flex flex-col gap-1">
                        <span>{f.title}</span>
                        {f.aiReview && (
                          <span className="w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            {t('aiAccepted')} · {Math.round(f.aiReview.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ' +
                          (f.riskRating === 'critical' || f.riskRating === 'high'
                            ? 'bg-red-100 text-red-800'
                            : f.riskRating === 'medium'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-muted text-secondary')
                        }
                      >
                        {t(`ratings.${f.riskRating}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-secondary">{f.owner ?? '—'}</td>
                    <td className="py-2 whitespace-nowrap text-secondary">
                      {f.dueDate ? fmt(f.dueDate) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('evidence')}</h2>
        {evidence.length === 0 ? (
          <p className="text-sm text-secondary">{t('evidenceEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="engagement-evidence">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="py-2 pr-4 font-medium">{t('evColName')}</th>
                  <th className="py-2 pr-4 font-medium">{t('evColType')}</th>
                  <th className="py-2 pr-4 font-medium">{t('evColOwner')}</th>
                  <th className="py-2 pr-4 font-medium">{t('evColReview')}</th>
                  <th className="py-2 font-medium">{t('evColSla')}</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((d) => {
                  const sla = slaStatus(d.renewBy, now);
                  const review = reviews[d.id]?.status ?? 'not_ready';
                  return (
                    <tr key={d.id} className="border-b border-border align-top last:border-0">
                      <td className="py-2 pr-4">
                        <a
                          href={`/documents/${d.id}/download`}
                          className="font-medium text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                        >
                          {d.filename}
                        </a>
                        {d.version > 1 && (
                          <span className="ml-1 text-xs text-secondary">v{d.version}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-secondary whitespace-nowrap">
                        {t(`rel.${d.relation}`)}
                      </td>
                      <td className="py-2 pr-4 text-secondary">{d.owner ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${REVIEW_TONE[review]}`}
                        >
                          {t(`review.${review}`)}
                        </span>
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SLA_TONE[sla]}`}
                        >
                          {sla === 'none' ? '—' : t(`sla.${sla}`)}
                        </span>
                        {d.renewBy && (
                          <span className="ml-1.5 text-xs text-secondary">{fmt(d.renewBy)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('milestones')}</h2>
        {eng.milestones.length === 0 ? (
          <p className="text-sm text-secondary">{t('milestonesEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-80 text-left text-sm"
              data-testid="engagement-milestones"
            >
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="py-2 pr-4 font-medium">{t('stage')}</th>
                  <th className="py-2 pr-4 font-medium">{t('planned')}</th>
                  <th className="py-2 font-medium">{t('actual')}</th>
                </tr>
              </thead>
              <tbody>
                {eng.milestones.map((m) => (
                  <tr key={m.stage} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{tStates(m.stage)}</td>
                    <td className="py-2 pr-4 text-secondary">{fmt(m.plannedDate)}</td>
                    <td className="py-2 text-secondary">{fmt(m.actualDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <CommentsSection
        entityType="engagement"
        entityId={id}
        path={`/engagements/${id}`}
        comments={comments}
        testid="engagement-comments"
      />
    </main>
  );
}
