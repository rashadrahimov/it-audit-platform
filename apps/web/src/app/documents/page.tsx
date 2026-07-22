import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { activeFilter, filterQuery, type SearchParams } from '@/lib/filters';
import {
  fulfillDocumentAction,
  publishDocumentAction,
  reassignDocumentOwnerAction,
  requestDocumentAction,
  uploadDocumentAction,
} from './actions';
import {
  createAuditFirmAction,
  deleteAuditFirmAction,
  setEvidenceReviewAction,
} from './evidence-actions';

export const dynamic = 'force-dynamic';

interface DocRow {
  id: string;
  filename: string;
  mime: string;
  size: number;
  version: number;
  renewBy: string | null;
  status: string;
  category: string | null;
  createdAt: string;
  owner: string | null;
  links: number;
}
interface Member {
  id: string;
  fullName: string;
  role: string;
}
interface ControlOpt {
  id: string;
  ref: string;
}
interface EngagementOpt {
  id: string;
  title: string;
}
interface EvidenceReview {
  status: string;
  reviewer: string | null;
  reviewedAt: string | null;
}
interface AuditFirm {
  id: string;
  name: string;
  contactEmail: string | null;
}
interface EvidenceGap {
  id: string;
  filename: string;
  status: string;
  category: string | null;
  renewBy: string | null;
  reason: string;
}
interface ReadinessSummary {
  generatedAt: string;
  totalDocuments: number;
  activeDocuments: number;
  requestedDocuments: number;
  draftDocuments: number;
  overdueDocuments: number;
  renewalDueSoon: number;
  linkedDocuments: number;
  unlinkedDocuments: number;
  evidenceLinks: number;
  acceptedLinks: number;
  readyLinks: number;
  flaggedLinks: number;
  notReadyLinks: number;
  reviewedEvidenceLinks: number;
  coveragePercent: number;
  reviewAcceptancePercent: number;
  readyPercent: number;
  topGaps: EvidenceGap[];
}
interface RescanPlan {
  generatedAt: string;
  windowDays: number;
  status: 'blocked' | 'hot' | 'watch' | 'ready';
  recentUploads: number;
  recentLinkedUploads: number;
  impacted: {
    engagements: number;
    controls: number;
    responses: number;
    checklistItems: number;
    otherEvidencePools: number;
  };
  queues: {
    extraction: number;
    ocr: number;
    aiFindingDrafts: number;
    evidenceRequestFollowUp: number;
    reportReadinessRefresh: number;
  };
  pendingRescans: number;
  pendingItems: Array<{
    id: string;
    filename: string;
    status: string;
    category: string | null;
    createdAt: string;
    bucket: string;
    reason: 'linked_evidence_upload' | 'draft_review_gate' | 'link_required';
    queueStatus: 'queued' | 'waiting_for_evidence';
    enabledQueues: Array<keyof RescanPlan['queues']>;
    impactedTargets: Array<{
      entityType: string;
      entityId?: string;
      relation: string;
      reviewStatus: string;
    }>;
    humanReviewGate: 'auditor_review_required';
    draftOnly: true;
    dueAt: string;
    explanation: string;
  }>;
  blockers: {
    requestedDocuments: number;
    draftDocuments: number;
    unlinkedDocuments: number;
    flaggedDocuments: number;
    ocrDocuments: number;
  };
  recentTriggers: Array<{
    id: string;
    filename: string;
    category: string | null;
    createdAt: string;
    bucket: string;
    rescanTrigger: {
      reason: 'linked_evidence_upload' | 'draft_review_gate' | 'link_required';
      queues: Record<keyof RescanPlan['queues'], boolean>;
      humanReviewGate: 'auditor_review_required';
      draftOnly: true;
    };
    links: Array<{ entityType: string; relation: string; reviewStatus: string }>;
  }>;
}
type ApiIntakeBucket = 'office_pdf' | 'spreadsheet' | 'image_ocr' | 'config_logs';
interface IntakeFormatContract {
  count: number;
  formats: Array<{
    bucket: ApiIntakeBucket;
    examples: string[];
    extensions: string[];
    queues: Array<keyof RescanPlan['queues']>;
    requiresOcr: boolean;
    canDraftFindings: true;
    humanReviewRequired: true;
    draftOnly: true;
  }>;
  evidenceGrounded: true;
  humanReviewRequired: true;
  draftOnly: true;
}

const REVIEW_STATUSES = ['not_ready', 'ready', 'flagged', 'accepted'] as const;
const REVIEW_TONE: Record<string, string> = {
  not_ready: 'bg-muted text-secondary',
  ready: 'bg-emerald-100 text-emerald-700',
  flagged: 'bg-red-100 text-red-700',
  accepted: 'bg-emerald-100 text-emerald-700',
};

const DOC_STATUSES = ['needs_document', 'draft', 'active', 'overdue'] as const;
const STATUS_TONE: Record<string, string> = {
  needs_document: 'bg-amber-100 text-amber-700',
  draft: 'bg-muted text-secondary',
  active: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
};

type IntakeBucket = 'officePdf' | 'spreadsheet' | 'imageOcr' | 'configLogs';
const API_INTAKE_BUCKETS: Record<ApiIntakeBucket, IntakeBucket> = {
  office_pdf: 'officePdf',
  spreadsheet: 'spreadsheet',
  image_ocr: 'imageOcr',
  config_logs: 'configLogs',
};

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}

function intakeBucketOf(doc: DocRow): IntakeBucket {
  const ext = extensionOf(doc.filename);
  const mime = doc.mime.toLowerCase();
  if (
    mime.includes('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'heic'].includes(ext)
  ) {
    return 'imageOcr';
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('csv') ||
    ['xls', 'xlsx', 'xlsm', 'csv', 'tsv'].includes(ext)
  ) {
    return 'spreadsheet';
  }
  if (['log', 'txt', 'json', 'yaml', 'yml', 'xml', 'conf', 'cfg', 'ini'].includes(ext)) {
    return 'configLogs';
  }
  return 'officePdf';
}

/** Реестр документов-доказательств (T-V01, T-V02): жизненный цикл, загрузка, привязки, owner. */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('documents'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const [
    docsRes,
    readinessRes,
    rescanPlanRes,
    intakeFormatsRes,
    membersRes,
    controlsRes,
    engagementsRes,
  ] = await Promise.all([
    apiFetch(`/documents?${filterQuery(sp, ['status']).slice(1)}`, { headers }),
    apiFetch('/documents/readiness-summary', { headers }),
    apiFetch('/documents/rescan-plan', { headers }),
    apiFetch('/documents/intake-formats', { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch(`/controls?tenantSlug=${tenantSlug}&locale=${locale}`, { headers }),
    apiFetch(`/engagements?locale=${locale}`, { headers }),
  ]);
  const docs: DocRow[] = docsRes.ok ? await docsRes.json() : [];
  const readiness: ReadinessSummary | null = readinessRes.ok ? await readinessRes.json() : null;
  const rescanPlan: RescanPlan | null = rescanPlanRes.ok ? await rescanPlanRes.json() : null;
  const intakeFormatContract: IntakeFormatContract | null = intakeFormatsRes.ok
    ? await intakeFormatsRes.json()
    : null;
  const members: Member[] = membersRes.ok ? await membersRes.json() : [];
  const controls: ControlOpt[] = controlsRes.ok ? await controlsRes.json() : [];
  const engagements: EngagementOpt[] = engagementsRes.ok ? await engagementsRes.json() : [];

  // T-V29: статусы ревью evidence по документам + реестр аудиторских фирм
  const [reviewsRes, firmsRes] = await Promise.all([
    docs.length > 0
      ? apiFetch(
          `/audit-firms/evidence-batch?entityType=document&entityIds=${docs.map((d) => d.id).join(',')}`,
          { headers },
        )
      : Promise.resolve(null),
    apiFetch('/audit-firms', { headers }),
  ]);
  const reviews: Record<string, EvidenceReview> =
    reviewsRes && reviewsRes.ok ? await reviewsRes.json() : {};
  const firms: AuditFirm[] = firmsRes.ok ? await firmsRes.json() : [];
  const requestedEntityType = activeFilter(sp, 'entityType');
  const requestedEntityId = activeFilter(sp, 'entityId');
  const requestedTarget =
    requestedEntityType &&
    requestedEntityId &&
    ['control', 'engagement'].includes(requestedEntityType)
      ? `${requestedEntityType}:${requestedEntityId}`
      : '';
  const requestedTargetLabel =
    requestedEntityType === 'engagement'
      ? (engagements.find((e) => e.id === requestedEntityId)?.title ?? t('uploadContextAudit'))
      : requestedEntityType === 'control'
        ? (controls.find((c) => c.id === requestedEntityId)?.ref ?? t('uploadContextControl'))
        : '';
  const intakeDocs = docs.filter((doc) => doc.status !== 'needs_document');
  const intakeCounts = intakeDocs.reduce<Record<IntakeBucket, number>>(
    (acc, doc) => {
      acc[intakeBucketOf(doc)] += 1;
      return acc;
    },
    { officePdf: 0, spreadsheet: 0, imageOcr: 0, configLogs: 0 },
  );
  const aiReadyDocuments = intakeDocs.filter(
    (doc) => doc.status === 'active' && doc.links > 0,
  ).length;
  const pendingOcrDocuments = intakeDocs.filter((doc) => intakeBucketOf(doc) === 'imageOcr').length;
  const pendingUploadDocuments = docs.filter((doc) => doc.status === 'needs_document').length;
  const unlinkedIntakeDocuments = intakeDocs.filter((doc) => doc.links === 0).length;

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const generatedAt = readiness?.generatedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(readiness.generatedAt),
      )
    : null;

  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 max-w-5xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {requestedTarget && (
        <section
          data-testid="document-upload-context"
          className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 shadow-[0_16px_45px_rgba(6,78,59,0.10)]"
        >
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-700 uppercase">
            {t('uploadContextKicker')}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-primary">{t('uploadContextTitle')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-secondary">
            {t('uploadContextBody', { target: requestedTargetLabel || requestedTarget })}
          </p>
        </section>
      )}

      {readiness && (
        <section
          data-testid="document-readiness-summary"
          className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-white shadow-[0_18px_55px_rgba(6,78,59,0.12)]"
        >
          <div className="relative border-b border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_36%),linear-gradient(135deg,#ecfdf5,#ffffff)] p-5">
            <div className="absolute top-4 right-5 hidden h-16 w-16 rounded-full bg-emerald-200/40 blur-2xl sm:block" />
            <p className="text-xs font-semibold tracking-[0.22em] text-emerald-700 uppercase">
              {t('readiness.kicker')}
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-primary">{t('readiness.title')}</h2>
                <p className="mt-1 max-w-2xl text-sm text-secondary">{t('readiness.subtitle')}</p>
              </div>
              <div className="rounded-2xl bg-emerald-950 px-5 py-4 text-center text-white shadow-lg shadow-emerald-950/15">
                <div className="text-3xl font-bold">{readiness.readyPercent}%</div>
                <div className="text-xs text-emerald-100">{t('readiness.ready')}</div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                style={{ width: `${readiness.readyPercent}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: t('readiness.coverage'),
                value: `${readiness.coveragePercent}%`,
                hint: t('readiness.coverageHint', {
                  linked: readiness.linkedDocuments,
                  total: readiness.totalDocuments,
                }),
              },
              {
                label: t('readiness.review'),
                value: `${readiness.reviewAcceptancePercent}%`,
                hint: t('readiness.reviewHint', {
                  accepted: readiness.acceptedLinks,
                  total: readiness.evidenceLinks,
                }),
              },
              {
                label: t('readiness.requests'),
                value: readiness.requestedDocuments,
                hint: t('readiness.requestsHint', { draft: readiness.draftDocuments }),
              },
              {
                label: t('readiness.renewals'),
                value: readiness.overdueDocuments + readiness.renewalDueSoon,
                hint: t('readiness.renewalsHint', {
                  overdue: readiness.overdueDocuments,
                  due: readiness.renewalDueSoon,
                }),
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf8)] p-4"
              >
                <div className="text-xs font-medium text-secondary">{metric.label}</div>
                <div className="mt-1 text-2xl font-bold text-primary">{metric.value}</div>
                <div className="mt-1 text-xs text-secondary">{metric.hint}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 border-t border-border p-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h3 className="text-sm font-semibold text-primary">{t('readiness.gapsTitle')}</h3>
              <div className="mt-3 flex flex-col gap-2">
                {readiness.topGaps.length > 0 ? (
                  readiness.topGaps.map((gap) => (
                    <div
                      key={`${gap.id}-${gap.reason}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{gap.filename}</div>
                        <div className="text-xs text-secondary">
                          {gap.category ?? t('readiness.noCategory')}
                          {gap.renewBy ? ` · ${dateFmt.format(new Date(gap.renewBy))}` : ''}
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {t(`readiness.reasons.${gap.reason}`)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                    {t('readiness.noGaps')}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
              <h3 className="text-sm font-semibold text-primary">{t('readiness.signalTitle')}</h3>
              <p className="mt-2 text-sm text-secondary">{t('readiness.signalBody')}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-secondary">{t('readiness.flagged')}</dt>
                  <dd className="text-xl font-bold text-primary">{readiness.flaggedLinks}</dd>
                </div>
                <div>
                  <dt className="text-xs text-secondary">{t('readiness.unlinked')}</dt>
                  <dd className="text-xl font-bold text-primary">{readiness.unlinkedDocuments}</dd>
                </div>
                <div>
                  <dt className="text-xs text-secondary">{t('readiness.reviewed')}</dt>
                  <dd className="text-xl font-bold text-primary">
                    {readiness.reviewedEvidenceLinks}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-secondary">{t('readiness.updated')}</dt>
                  <dd className="text-xs font-medium text-primary">{generatedAt ?? '—'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      )}

      <section
        data-testid="document-ai-intake"
        className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-[0_16px_50px_rgba(15,118,110,0.10)]"
      >
        <div className="border-b border-teal-100 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.18),transparent_34%),linear-gradient(135deg,#f0fdfa,#ffffff)] p-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-teal-700 uppercase">
            {t('intake.kicker')}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-primary">{t('intake.title')}</h2>
              <p className="mt-1 max-w-3xl text-sm text-secondary">{t('intake.subtitle')}</p>
            </div>
            <div className="rounded-2xl bg-teal-950 px-4 py-3 text-center text-white shadow-lg shadow-teal-950/15">
              <div className="text-2xl font-bold">{aiReadyDocuments}</div>
              <div className="text-xs text-teal-100">{t('intake.aiReady')}</div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-4">
          {(['officePdf', 'spreadsheet', 'imageOcr', 'configLogs'] as const).map((bucket) => (
            <div
              key={bucket}
              className="rounded-xl border border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf8)] p-4"
            >
              <div className="text-xs font-semibold tracking-wide text-secondary uppercase">
                {t(`intake.buckets.${bucket}.label`)}
              </div>
              <div className="mt-2 text-2xl font-bold text-primary">{intakeCounts[bucket]}</div>
              <div className="mt-1 text-xs text-secondary">
                {t(`intake.buckets.${bucket}.hint`)}
              </div>
            </div>
          ))}
        </div>
        {intakeFormatContract && (
          <div
            className="border-t border-teal-100 bg-teal-50/40 p-5"
            data-testid="document-intake-format-proof"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-primary">{t('intake.formatsTitle')}</h3>
                <p className="mt-1 max-w-3xl text-xs text-secondary">
                  {t('intake.formatsSubtitle')}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-100">
                {t('intake.humanGate')}
              </span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              {intakeFormatContract.formats.map((format) => {
                const bucket = API_INTAKE_BUCKETS[format.bucket];
                return (
                  <div key={format.bucket} className="rounded-xl bg-white/85 p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-primary">
                        {t(`intake.buckets.${bucket}.label`)}
                      </span>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                        {format.requiresOcr ? t('intake.requiresOcr') : t('intake.textExtraction')}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-secondary">
                      {t('intake.supportedExt', {
                        extensions: format.extensions.slice(0, 6).join(', '),
                      })}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {format.queues.map((queue) => (
                        <span
                          key={queue}
                          className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-secondary"
                        >
                          {t(`rescan.queues.${queue}.label`)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="grid gap-3 border-t border-border p-5 md:grid-cols-3">
          {[
            ['linked', aiReadyDocuments],
            ['ocr', pendingOcrDocuments],
            ['blocked', pendingUploadDocuments + unlinkedIntakeDocuments],
          ].map(([key, value]) => (
            <div key={key} className="rounded-xl bg-muted/60 p-4 text-sm">
              <div className="text-xs font-semibold tracking-wide text-secondary uppercase">
                {t(`intake.signals.${key}.label`)}
              </div>
              <div className="mt-1 text-2xl font-bold text-primary">{value}</div>
              <div className="mt-1 text-xs text-secondary">{t(`intake.signals.${key}.hint`)}</div>
            </div>
          ))}
        </div>
      </section>

      {rescanPlan && (
        <section
          data-testid="document-rescan-plan"
          className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_18px_55px_rgba(6,78,59,0.12)]"
        >
          <div className="border-b border-emerald-100 bg-[radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(135deg,#f0fdf4,#ffffff)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-emerald-700 uppercase">
                  {t('rescan.kicker')}
                </p>
                <h2 className="mt-2 text-xl font-bold text-primary">{t('rescan.title')}</h2>
                <p className="mt-1 max-w-3xl text-sm text-secondary">
                  {t('rescan.subtitle', { days: rescanPlan.windowDays })}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-950 px-4 py-3 text-center text-white shadow-lg shadow-emerald-950/15">
                <div className="text-2xl font-bold">{rescanPlan.recentLinkedUploads}</div>
                <div className="text-xs text-emerald-100">{t('rescan.recentLinked')}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                {t(`rescan.status.${rescanPlan.status}`)}
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-secondary ring-1 ring-emerald-100">
                {t('rescan.recentUploads', { count: rescanPlan.recentUploads })}
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-secondary ring-1 ring-emerald-100">
                {t('rescan.impactedSummary', {
                  engagements: rescanPlan.impacted.engagements,
                  controls: rescanPlan.impacted.controls,
                })}
              </span>
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-5">
            {(
              [
                'extraction',
                'ocr',
                'aiFindingDrafts',
                'evidenceRequestFollowUp',
                'reportReadinessRefresh',
              ] as const
            ).map((key) => (
              <div
                key={key}
                className="rounded-xl border border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf8)] p-4"
              >
                <div className="text-xs font-semibold tracking-wide text-secondary uppercase">
                  {t(`rescan.queues.${key}.label`)}
                </div>
                <div className="mt-2 text-2xl font-bold text-primary">{rescanPlan.queues[key]}</div>
                <div className="mt-1 text-xs text-secondary">{t(`rescan.queues.${key}.hint`)}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-primary">{t('rescan.pendingTitle')}</h3>
                <p className="mt-1 text-xs text-secondary">{t('rescan.pendingSubtitle')}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                {t('rescan.pendingCount', { count: rescanPlan.pendingRescans })}
              </span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {rescanPlan.pendingItems.length > 0 ? (
                rescanPlan.pendingItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#ffffff,#f2fbf6)] p-4 shadow-sm"
                    data-testid="document-pending-rescan-item"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {item.filename}
                        </div>
                        <div className="mt-1 text-xs text-secondary">
                          {item.category ?? t('readiness.noCategory')} ·{' '}
                          {t(`rescan.triggerReasons.${item.reason}`)}
                        </div>
                      </div>
                      <span
                        className={
                          item.queueStatus === 'queued'
                            ? 'rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white'
                            : 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800'
                        }
                      >
                        {t(`rescan.queueStatus.${item.queueStatus}`)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.enabledQueues.map((queue) => (
                        <span
                          key={queue}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-primary shadow-sm ring-1 ring-emerald-100"
                        >
                          {t(`rescan.queues.${queue}.label`)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-secondary md:grid-cols-2">
                      <div>
                        <span className="font-medium text-primary">
                          {t('rescan.pendingTargets')}
                        </span>{' '}
                        {item.impactedTargets.length}
                      </div>
                      <div>
                        <span className="font-medium text-primary">{t('rescan.pendingDue')}</span>{' '}
                        {dateFmt.format(new Date(item.dueAt))}
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-secondary">
                      {t('rescan.triggerGate')} · {item.explanation}
                    </p>
                  </article>
                ))
              ) : (
                <div className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800 lg:col-span-2">
                  {t('rescan.noPending')}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-t border-border p-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-xl bg-muted/60 p-4">
              <h3 className="text-sm font-semibold text-primary">{t('rescan.blockersTitle')}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    'requestedDocuments',
                    'draftDocuments',
                    'unlinkedDocuments',
                    'flaggedDocuments',
                    'ocrDocuments',
                  ] as const
                ).map((key) => (
                  <div key={key}>
                    <dt className="text-xs text-secondary">{t(`rescan.blockers.${key}`)}</dt>
                    <dd className="text-xl font-bold text-primary">{rescanPlan.blockers[key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary">{t('rescan.triggersTitle')}</h3>
              <div className="mt-3 flex flex-col gap-2">
                {rescanPlan.recentTriggers.length > 0 ? (
                  rescanPlan.recentTriggers.map((trigger) => {
                    const enabledQueues = Object.entries(trigger.rescanTrigger.queues).filter(
                      ([, enabled]) => enabled,
                    );
                    return (
                      <div
                        key={trigger.id}
                        className="rounded-xl bg-muted/60 px-3 py-2 text-sm"
                        data-testid="document-rescan-trigger-proof"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {trigger.filename}
                            </div>
                            <div className="text-xs text-secondary">
                              {trigger.category ?? t('readiness.noCategory')} ·{' '}
                              {dateFmt.format(new Date(trigger.createdAt))}
                            </div>
                          </div>
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                            {trigger.links.length > 0
                              ? t('rescan.linkedTargets', { count: trigger.links.length })
                              : t('rescan.unlinked')}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-secondary">
                          {t(`rescan.triggerReasons.${trigger.rescanTrigger.reason}`)} ·{' '}
                          {t('rescan.triggerGate')}
                        </div>
                        {enabledQueues.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {enabledQueues.map(([queue]) => (
                              <span
                                key={queue}
                                className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-primary shadow-sm"
                              >
                                {t(`rescan.queues.${queue}.label`)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                    {t('rescan.noTriggers')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <form
        action={uploadDocumentAction}
        id="document-upload"
        data-testid="document-upload"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('upload')}</span>
          <input
            type="file"
            name="file"
            required
            className="min-w-0 max-w-full text-sm text-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('linkTo')}</span>
          <select
            name="target"
            defaultValue={requestedTarget}
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">{t('linkNone')}</option>
            <optgroup label={t('linkControls')}>
              {controls.map((c) => (
                <option key={c.id} value={`control:${c.id}`}>
                  {c.ref}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('linkEngagements')}>
              {engagements.map((e) => (
                <option key={e.id} value={`engagement:${e.id}`}>
                  {e.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('category')}</span>
          <input
            type="text"
            name="category"
            placeholder={t('categoryPh')}
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('renewBy')}</span>
          <input
            type="date"
            name="renewBy"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex items-center gap-1.5 self-end pb-1.5 text-sm text-secondary">
          <input type="checkbox" name="status" value="draft" />
          {t('saveDraft')}
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('uploadBtn')}
        </button>
      </form>

      <section
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="document-request"
      >
        <div className="w-full">
          <h2 className="text-sm font-semibold text-primary">{t('requestTitle')}</h2>
          <p className="text-xs text-secondary">{t('requestHint')}</p>
        </div>
        <form action={requestDocumentAction} className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('requestName')}</span>
            <input
              name="filename"
              required
              placeholder={t('requestNamePh')}
              className="min-w-0 max-w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('category')}</span>
            <input
              name="category"
              placeholder={t('categoryPh')}
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('renewBy')}</span>
            <input
              type="date"
              name="renewBy"
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            data-testid="document-request-btn"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('requestBtn')}
          </button>
        </form>
      </section>

      <FilterBar
        basePath="/documents"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'status',
            label: tFilters('status'),
            options: DOC_STATUSES.map((s) => ({ value: s, label: t(`st.${s}`) })),
          },
        ]}
      />

      <section className="max-w-full min-w-0 overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[570px] text-left text-sm" data-testid="documents-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('colName')}</th>
              <th className="px-4 py-3 font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('colCategory')}</th>
              <th className="px-4 py-3 font-medium">{t('colOwner')}</th>
              <th className="px-4 py-3 font-medium">{t('evidence')}</th>
              <th className="px-4 py-3 font-medium">{t('colRenewBy')}</th>
              <th className="px-4 py-3 font-medium">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-3 font-medium">
                  {d.status === 'needs_document' ? (
                    <span className="text-foreground">{d.filename}</span>
                  ) : (
                    <a
                      href={`/documents/${d.id}/download`}
                      className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                    >
                      {d.filename}
                    </a>
                  )}
                  {d.version > 1 && (
                    <span className="ml-1 text-xs text-secondary">v{d.version}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    data-testid={`doc-status-${d.id}`}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[d.status] ?? 'bg-muted text-secondary'}`}
                  >
                    {t(`st.${d.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-secondary whitespace-nowrap">{d.category ?? '—'}</td>
                <td className="px-4 py-3 text-secondary">
                  {members.length > 0 ? (
                    <form
                      action={reassignDocumentOwnerAction.bind(null, d.id)}
                      className="flex items-center gap-1.5"
                    >
                      <select
                        name="ownerMembershipId"
                        aria-label={`${t('colOwner')}: ${d.filename}`}
                        defaultValue={members.find((m) => m.fullName === d.owner)?.id ?? ''}
                        className="rounded-md border border-border bg-white px-1.5 py-1 text-xs text-foreground"
                      >
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                      >
                        {t('ownerSave')}
                      </button>
                    </form>
                  ) : (
                    (d.owner ?? '—')
                  )}
                </td>
                <td className="px-4 py-3" data-testid={`evidence-${d.id}`}>
                  <form
                    action={setEvidenceReviewAction.bind(null, 'document', d.id)}
                    className="flex items-center gap-1.5"
                  >
                    <select
                      name="status"
                      aria-label={`${t('evidence')}: ${d.filename}`}
                      defaultValue={reviews[d.id]?.status ?? 'not_ready'}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_TONE[reviews[d.id]?.status ?? 'not_ready']}`}
                    >
                      {REVIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`ev.${s}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      data-testid="evidence-save"
                      className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                    >
                      {t('ownerSave')}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-secondary whitespace-nowrap">
                  {d.renewBy ? dateFmt.format(new Date(d.renewBy)) : '—'}
                </td>
                <td className="px-4 py-3">
                  {d.status === 'needs_document' ? (
                    <form
                      action={fulfillDocumentAction.bind(null, d.id)}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="file"
                        name="file"
                        aria-label={`${t('uploadFile')}: ${d.filename}`}
                        required
                        className="w-28 text-xs text-foreground file:mr-1.5 file:rounded file:border file:border-border file:bg-muted file:px-1.5 file:py-0.5 file:text-xs file:text-secondary"
                      />
                      <button
                        type="submit"
                        data-testid={`doc-fulfill-${d.id}`}
                        className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                      >
                        {t('uploadFile')}
                      </button>
                    </form>
                  ) : d.status === 'draft' ? (
                    <form action={publishDocumentAction.bind(null, d.id)}>
                      <button
                        type="submit"
                        data-testid={`doc-publish-${d.id}`}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                      >
                        {t('publish')}
                      </button>
                    </form>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-accent">
                        {t('newVersion')}
                      </summary>
                      <form
                        action={fulfillDocumentAction.bind(null, d.id)}
                        className="mt-1.5 flex items-center gap-1.5"
                      >
                        <input
                          type="file"
                          name="file"
                          aria-label={`${t('newVersion')}: ${d.filename}`}
                          required
                          className="w-28 text-xs text-foreground file:mr-1.5 file:rounded file:border file:border-border file:bg-muted file:px-1.5 file:py-0.5 file:text-xs file:text-secondary"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                        >
                          {t('uploadFile')}
                        </button>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="audit-firms"
      >
        <h2 className="text-sm font-semibold text-primary">{t('auditFirms')}</h2>
        <p className="text-xs text-secondary">{t('auditFirmsHint')}</p>
        {firms.length > 0 && (
          <ul className="flex flex-col gap-2">
            {firms.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-foreground">{f.name}</span>
                  {f.contactEmail && (
                    <span className="ml-2 text-xs text-secondary">{f.contactEmail}</span>
                  )}
                </span>
                <form action={deleteAuditFirmAction.bind(null, f.id)}>
                  <button
                    type="submit"
                    data-testid="firm-delete"
                    aria-label={t('firmDelete')}
                    className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form
          action={createAuditFirmAction}
          className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
          data-testid="firm-create"
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('firmName')}</span>
            <input
              name="name"
              required
              placeholder={t('firmNamePh')}
              className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('firmEmail')}</span>
            <input
              name="contactEmail"
              type="email"
              className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
          <button
            type="submit"
            data-testid="firm-add"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('firmAdd')}
          </button>
        </form>
      </section>
    </main>
  );
}
