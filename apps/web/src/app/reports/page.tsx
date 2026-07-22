import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface Snapshot {
  id: string;
  label: string;
  capturedAt: string;
}
interface Cell {
  a: number;
  b: number;
  delta: number;
}
interface CompareResult {
  a: { id: string; label: string };
  b: { id: string; label: string };
  diff: Record<string, Record<string, Cell>>;
}
interface EngagementRow {
  id: string;
  title: string;
  state: string;
  subsidiary: string | null;
  auditType: string | null;
}
interface SchedulePreview {
  enabled: boolean;
  digest: 'weekly' | 'monthly' | 'daily' | 'off';
  schedule: 'anytime' | 'work_hours';
  timezone: string;
  nextRunAt: string | null;
  recipientCount: number;
  willSendIfRunNow: boolean;
  metrics: {
    openFindings: number;
    overdueFindings: number;
    overdueTasks: number;
    policiesDue: number;
  };
  deliveryProof?: {
    queue: string;
    jobName: string;
    intervalMs: number;
    emailTemplate: string;
    manualTriggerPath: string;
    recipientPolicy: string;
    signalGate: string;
  };
  deliveryPlan?: {
    enabled: boolean;
    selectedCadence: 'weekly' | 'monthly' | 'daily' | 'off';
    supportedCadences: Array<'weekly' | 'monthly' | 'daily' | 'off'>;
    package: {
      deliverables: string[];
      formats: Array<'pdf' | 'docx' | 'xlsx'>;
      locales: string[];
      totalFiles: number;
    };
    email: {
      enabled: boolean;
      template: string;
      recipientCount: number;
      recipientPolicy: string;
      schedule: 'anytime' | 'work_hours';
      timezone: string;
    };
    automation: {
      queue: string;
      jobName: string;
      intervalMs: number;
      manualTriggerPath: string;
      dailyWorkerEvaluatesCadence: boolean;
      signalGate: string;
    };
  };
}
interface ReportReadiness {
  engagementId: string;
  title: string;
  subsidiary: string | null;
  auditType: string | null;
  state: string;
  generatedAt: string;
  score: number;
  ready: boolean;
  checklistTotal: number;
  answered: number;
  findings: number;
  findingsOpen: number;
  highRiskFindings: number;
  risks: number;
  evidenceLinks: number;
  checks: { key: string; passed: boolean }[];
}
interface ReportPackageManifest {
  locale: string;
  supportedLocales: string[];
  totalFiles: number;
  dataSources: string[];
  evidenceGrounded: true;
  humanReviewRequired: true;
  readinessGate: {
    ready: boolean;
    score: number;
  };
  formats: Array<{
    key: 'pdf' | 'docx' | 'xlsx';
    label: string;
    editable: boolean;
    analyticsReady: boolean;
  }>;
  deliverables: Array<{
    key: (typeof DELIVERABLES)[number];
    title: string;
    formats: Array<{ key: string; href: string }>;
  }>;
}

const ENTITIES = ['findings', 'risks', 'controls'];
const FORMATS = ['csv', 'xml'];
const DELIVERABLE_FORMATS = ['pdf', 'docx', 'xlsx'] as const;
const DELIVERABLES = [
  'audit_report',
  'nonconformities',
  'risk_matrix',
  'action_plan',
  'executive_summary',
] as const;

const selectCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const dlCls =
  'rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function deltaTone(d: number): string {
  if (d > 0) return 'text-emerald-700';
  if (d < 0) return 'text-red-600';
  return 'text-secondary';
}

/** Отчёты (REP-05/REP-03): выгрузка CSV/XML + сравнение двух снапшотов. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; engagementId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('reports'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [snapRes, engagementRes, scheduleRes] = await Promise.all([
    apiFetch('/snapshots', { headers }),
    apiFetch(`/engagements?locale=${locale}`, { headers }),
    apiFetch('/reports/schedule-preview', { headers }),
  ]);
  const snapshots: Snapshot[] = snapRes.ok ? await snapRes.json() : [];
  const engagements: EngagementRow[] = engagementRes.ok ? await engagementRes.json() : [];
  const schedule: SchedulePreview | null = scheduleRes.ok ? await scheduleRes.json() : null;
  const selectedEngagement =
    engagements.find((e) => e.id === sp.engagementId) ?? engagements[0] ?? null;
  let readiness: ReportReadiness | null = null;
  let packageManifest: ReportPackageManifest | null = null;
  if (selectedEngagement) {
    const [readinessRes, manifestRes] = await Promise.all([
      apiFetch(`/engagements/${selectedEngagement.id}/report/readiness?locale=${locale}`, {
        headers,
      }),
      apiFetch(`/engagements/${selectedEngagement.id}/report/package-manifest?locale=${locale}`, {
        headers,
      }),
    ]);
    readiness = readinessRes.ok ? await readinessRes.json() : null;
    packageManifest = manifestRes.ok ? await manifestRes.json() : null;
  }

  let compare: CompareResult | null = null;
  if (sp.a && sp.b) {
    const cmpRes = await apiFetch(
      `/reports/compare?a=${encodeURIComponent(sp.a)}&b=${encodeURIComponent(sp.b)}`,
      { headers },
    );
    if (cmpRes.ok) compare = await cmpRes.json();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {schedule && (
        <section
          className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"
          data-testid="report-schedule-preview"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
                {t('schedule.kicker')}
              </p>
              <h2 className="text-lg font-semibold text-primary">{t('schedule.title')}</h2>
              <p className="mt-1 text-sm text-secondary">
                {schedule.enabled
                  ? t('schedule.next', {
                      date: schedule.nextRunAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(schedule.nextRunAt))
                        : '—',
                    })
                  : t('schedule.disabled')}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                schedule.willSendIfRunNow
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {schedule.willSendIfRunNow ? t('schedule.ready') : t('schedule.quiet')}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            {(
              [
                ['openFindings', schedule.metrics.openFindings],
                ['overdueFindings', schedule.metrics.overdueFindings],
                ['overdueTasks', schedule.metrics.overdueTasks],
                ['policiesDue', schedule.metrics.policiesDue],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-muted/60 p-3">
                <dd className="text-2xl font-bold tabular-nums text-primary">{value}</dd>
                <dt className="text-xs text-secondary">{t(`schedule.metrics.${key}`)}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-secondary">
            {t('schedule.meta', {
              digest: t(`schedule.digest.${schedule.digest}`),
              recipients: schedule.recipientCount,
              timezone: schedule.timezone,
            })}
          </p>
          <div
            data-testid="report-delivery-plan"
            className="mt-5 grid gap-3 border-t border-emerald-100 pt-4 md:grid-cols-4"
          >
            {[
              {
                key: 'cadence',
                value: t(
                  `schedule.digest.${schedule.deliveryPlan?.selectedCadence ?? schedule.digest}`,
                ),
                testId: 'report-scheduled-cadences',
                hintSuffix: schedule.deliveryPlan
                  ? schedule.deliveryPlan.supportedCadences
                      .map((cadence) => t(`schedule.digest.${cadence}`))
                      .join(' / ')
                  : undefined,
              },
              {
                key: 'package',
                value: t('schedule.delivery.packageValue', {
                  deliverables:
                    schedule.deliveryPlan?.package.deliverables.length ?? DELIVERABLES.length,
                  formats: (schedule.deliveryPlan?.package.formats ?? DELIVERABLE_FORMATS)
                    .map((fmt) => fmt.toUpperCase())
                    .join(' / '),
                }),
              },
              {
                key: 'languages',
                value: (schedule.deliveryPlan?.package.locales ?? ['en', 'az', 'ru'])
                  .map((l) => l.toUpperCase())
                  .join(' / '),
              },
              {
                key: 'trigger',
                value: schedule.willSendIfRunNow
                  ? t('schedule.delivery.triggerReady')
                  : t('schedule.delivery.triggerQuiet'),
              },
            ].map((item) => (
              <div
                key={item.key}
                data-testid={item.testId}
                className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"
              >
                <div className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                  {t(`schedule.delivery.${item.key}.label`)}
                </div>
                <div className="mt-1 text-sm font-semibold text-primary">{item.value}</div>
                <div className="mt-1 text-xs text-secondary">
                  {t(`schedule.delivery.${item.key}.hint`)}
                  {item.hintSuffix ? ` · ${item.hintSuffix}` : null}
                </div>
              </div>
            ))}
          </div>
          {schedule.deliveryProof && (
            <div
              data-testid="report-delivery-proof"
              className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.12em] text-emerald-800 uppercase">
                    {t('schedule.proof.kicker')}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-primary">
                    {t('schedule.proof.title')}
                  </h3>
                  <p className="mt-1 text-xs text-secondary">{t('schedule.proof.hint')}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {schedule.deliveryProof.manualTriggerPath}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 md:grid-cols-4">
                {(
                  [
                    ['queue', schedule.deliveryProof.queue],
                    ['job', schedule.deliveryProof.jobName],
                    [
                      'interval',
                      t('schedule.proof.intervalValue', {
                        hours: Math.round(schedule.deliveryProof.intervalMs / 3_600_000),
                      }),
                    ],
                    ['template', schedule.deliveryProof.emailTemplate],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-white/80 p-3">
                    <dt className="text-xs font-medium text-secondary">
                      {t(`schedule.proof.${key}`)}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 grid gap-2 text-xs text-secondary md:grid-cols-2">
                <p>{t('schedule.proof.recipientPolicy')}</p>
                <p>{t('schedule.proof.signalGate')}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Пакет стандартных deliverables */}
      <section className="overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 text-white shadow-xl shadow-emerald-950/10">
        <div className="grid gap-6 p-6 md:grid-cols-[1.15fr_0.85fr] md:p-8">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-emerald-200 uppercase">
              {t('deliverables.kicker')}
            </p>
            <h2 className="max-w-xl text-3xl font-bold tracking-tight">
              {t('deliverables.title')}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/80">
              {t('deliverables.hint')}
            </p>
          </div>
          <form method="GET" className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <label className="flex flex-col gap-2 text-xs font-medium text-emerald-50">
              {t('deliverables.engagement')}
              <select
                name="engagementId"
                defaultValue={selectedEngagement?.id ?? ''}
                className="rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-primary shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:outline-none"
              >
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors duration-150 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:outline-none"
            >
              {t('deliverables.apply')}
            </button>
            {selectedEngagement && (
              <p className="mt-3 text-xs text-emerald-50/75">
                {selectedEngagement.subsidiary ?? '—'} · {selectedEngagement.auditType ?? '—'} ·{' '}
                {selectedEngagement.state}
              </p>
            )}
          </form>
        </div>
        {readiness && (
          <div
            className="border-t border-white/10 bg-emerald-950/35 px-6 py-5 md:px-8"
            data-testid="report-readiness"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-emerald-200 uppercase">
                  {t('deliverables.readiness.kicker')}
                </p>
                <h3 className="mt-1 text-xl font-bold">
                  {t('deliverables.readiness.title', { score: readiness.score })}
                </h3>
                <p className="mt-1 text-sm text-emerald-50/75">
                  {t('deliverables.readiness.subtitle')}
                </p>
              </div>
              <div className="rounded-2xl bg-white px-5 py-4 text-center text-emerald-950 shadow-lg shadow-emerald-950/20">
                <div className="text-3xl font-bold">{readiness.score}%</div>
                <div className="text-xs font-semibold">
                  {readiness.ready
                    ? t('deliverables.readiness.ready')
                    : t('deliverables.readiness.review')}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: t('deliverables.readiness.metrics.responses'),
                  value: `${readiness.answered}/${readiness.checklistTotal}`,
                },
                {
                  label: t('deliverables.readiness.metrics.findings'),
                  value: readiness.findingsOpen,
                },
                {
                  label: t('deliverables.readiness.metrics.risks'),
                  value: readiness.risks,
                },
                {
                  label: t('deliverables.readiness.metrics.evidence'),
                  value: readiness.evidenceLinks,
                },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl bg-white/10 px-3 py-2">
                  <div className="text-lg font-bold text-white">{metric.value}</div>
                  <div className="text-xs text-emerald-50/70">{metric.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {readiness.checks.map((check) => (
                <span
                  key={check.key}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    check.passed ? 'bg-emerald-200 text-emerald-950' : 'bg-amber-200 text-amber-950'
                  }`}
                >
                  {check.passed ? '✓' : '•'} {t(`deliverables.readiness.checks.${check.key}`)}
                </span>
              ))}
            </div>
          </div>
        )}
        {packageManifest && (
          <div
            className="border-t border-white/10 bg-emerald-950/25 px-6 py-5 md:px-8"
            data-testid="report-package-manifest-proof"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-emerald-200 uppercase">
                  {t('deliverables.manifest.kicker')}
                </p>
                <h3 className="mt-1 text-lg font-bold">
                  {t('deliverables.manifest.title', { files: packageManifest.totalFiles })}
                </h3>
                <p className="mt-1 max-w-3xl text-sm text-emerald-50/75">
                  {t('deliverables.manifest.subtitle')}
                </p>
              </div>
              <div className="rounded-2xl bg-white/95 px-4 py-3 text-center text-emerald-950">
                <div className="text-xl font-bold">
                  {packageManifest.supportedLocales.map((l) => l.toUpperCase()).join(' / ')}
                </div>
                <div className="text-xs font-semibold">{t('deliverables.manifest.locales')}</div>
              </div>
            </div>
            {selectedEngagement && (
              <div className="mt-4">
                <a
                  href={`/engagements/${selectedEngagement.id}/report/package?locale=${locale}`}
                  className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-950/15 transition-colors duration-150 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:outline-none"
                  data-testid="download-report-package"
                >
                  {t('deliverables.downloadPackage')}
                </a>
              </div>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {packageManifest.formats.map((format) => (
                <div key={format.key} className="rounded-xl bg-white/10 p-3">
                  <div className="text-sm font-semibold text-white">
                    {format.label} · {format.key.toUpperCase()}
                  </div>
                  <div className="mt-1 text-xs text-emerald-50/70">
                    {format.editable
                      ? t('deliverables.manifest.editable')
                      : format.analyticsReady
                        ? t('deliverables.manifest.analytics')
                        : t('deliverables.manifest.final')}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">
                {t('deliverables.manifest.evidenceGrounded')}
              </span>
              <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">
                {t('deliverables.manifest.reviewGate', {
                  score: packageManifest.readinessGate.score,
                })}
              </span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-emerald-50">
                {t('deliverables.manifest.sources', {
                  sources: packageManifest.dataSources.join(', '),
                })}
              </span>
            </div>
          </div>
        )}
        <div className="grid gap-3 border-t border-white/10 bg-white/8 p-4 md:grid-cols-5">
          {selectedEngagement ? (
            DELIVERABLES.map((d, index) => (
              <article
                key={d}
                className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur"
                data-testid={`deliverable-${d}`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300/20 text-sm font-bold text-emerald-50">
                    {index + 1}
                  </span>
                  <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-[10px] font-semibold tracking-wide text-emerald-100 uppercase">
                    {readiness?.ready
                      ? t('deliverables.ready')
                      : t('deliverables.readiness.review')}
                  </span>
                </div>
                <h3 className="text-sm font-semibold">{t(`deliverables.items.${d}.title`)}</h3>
                <p className="mt-2 min-h-16 text-xs leading-5 text-emerald-50/75">
                  {t(`deliverables.items.${d}.hint`)}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {DELIVERABLE_FORMATS.map((fmt) => (
                    <a
                      key={fmt}
                      href={`/engagements/${selectedEngagement.id}/report?format=${fmt}&locale=${locale}&deliverable=${d}`}
                      className="rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-950 transition-colors duration-150 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:outline-none"
                      data-testid={`deliverable-${d}-${fmt}`}
                    >
                      {fmt.toUpperCase()}
                    </a>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <div className="md:col-span-5">
              <EmptyState size="sm" text={t('deliverables.empty')} />
            </div>
          )}
        </div>
      </section>

      {/* Выгрузка */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('export')}</h2>
        <div
          className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm"
          data-testid="export-table"
        >
          <table className="w-full text-left text-sm">
            <tbody>
              {ENTITIES.map((e) => (
                <tr key={e} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{t(`entities.${e}`)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {FORMATS.map((f) => (
                        <a
                          key={f}
                          href={`/reports/export?entity=${e}&format=${f}`}
                          data-testid={`dl-${e}-${f}`}
                          className={dlCls}
                        >
                          {f.toUpperCase()}
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Сравнение снапшотов */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('compare')}</h2>
        {snapshots.length < 2 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('needTwo')} />
          </div>
        ) : (
          <form
            method="GET"
            data-testid="compare-form"
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <label className="flex flex-col gap-1 text-xs text-secondary">
              {t('periodA')}
              <select name="a" defaultValue={sp.a ?? snapshots[0]?.id} className={selectCls}>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-secondary">
              {t('periodB')}
              <select name="b" defaultValue={sp.b ?? snapshots[1]?.id} className={selectCls}>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('run')}
            </button>
          </form>
        )}

        {compare && (
          <div className="flex flex-col gap-4" data-testid="compare-result">
            <p className="text-xs text-secondary">
              <span className="font-medium text-foreground">{compare.a.label}</span> ↔{' '}
              <span className="font-medium text-foreground">{compare.b.label}</span>
            </p>
            {Object.entries(compare.diff).map(([group, rows]) => (
              <div
                key={group}
                className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm"
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-secondary">
                      <th className="px-4 py-2 font-medium">
                        {t.has(`metrics.${group}`) ? t(`metrics.${group}`) : group}
                      </th>
                      <th className="px-4 py-2 font-medium text-right">A</th>
                      <th className="px-4 py-2 font-medium text-right">B</th>
                      <th className="px-4 py-2 font-medium text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(rows).map(([key, cell]) => (
                      <tr key={key} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-secondary">{key}</td>
                        <td className="px-4 py-2 text-right text-foreground">{cell.a}</td>
                        <td className="px-4 py-2 text-right text-foreground">{cell.b}</td>
                        <td className={`px-4 py-2 text-right font-medium ${deltaTone(cell.delta)}`}>
                          {cell.delta > 0 ? `+${cell.delta}` : cell.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
