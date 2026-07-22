import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { setTargetDateAction } from './actions';

export const dynamic = 'force-dynamic';

interface Phase {
  key: string;
  progress: number;
}
interface RoadmapItem {
  activationId: string;
  frameworkId: string;
  name: string;
  phases: Phase[];
  overall: number;
  auditReady: boolean;
  targetDate: string | null;
  elapsedPct: number | null;
  onTrack: boolean | null;
}
interface Roadmap {
  phaseOrder: string[];
  items: RoadmapItem[];
}

const REQUIREMENT_COVERAGE = [
  {
    key: 'workflow',
    status: 'live',
    evidence: ['audit-charter', 'engagements', 'roadmap', 'domain-progress'],
  },
  {
    key: 'riskRegister',
    status: 'live',
    evidence: ['risks', 'business-risk-lens', 'ai-risk-suggestions', 'approval'],
  },
  {
    key: 'documentAi',
    status: 'live',
    evidence: [
      'evidence-grounded-findings',
      'ai-explainability',
      'document-ai-intake',
      'evidence-rescan-plan',
      'ocr-readiness',
    ],
  },
  {
    key: 'recommendations',
    status: 'live',
    evidence: ['findings', 'action-plan', 'tasks'],
  },
  {
    key: 'deliverables',
    status: 'live',
    evidence: ['pdf', 'docx', 'xlsx', 'az-en-ru'],
  },
  {
    key: 'trustSecurity',
    status: 'live',
    evidence: ['rbac', 'audit-log', 'ai-traceability', 'tenant-isolation', 'private-cloud'],
  },
  {
    key: 'collaboration',
    status: 'live',
    evidence: ['team', 'tasks', 'drl', 'evidence-requests'],
  },
  {
    key: 'integrations',
    status: 'live',
    evidence: ['api-v1', 'connectors', 'cross-framework-mapping'],
  },
  {
    key: 'reportingUx',
    status: 'live',
    evidence: ['dashboards', 'scheduled-delivery-plan', 'email-digest-worker', 'locales'],
  },
  {
    key: 'advancedAi',
    status: 'live',
    evidence: [
      'audit-query',
      'auto-drl',
      'continuous-summary',
      'evidence-rescan-plan',
      'continuous-review-gates',
    ],
  },
] as const;

function barTone(progress: number): string {
  if (progress >= 100) return 'bg-emerald-500';
  if (progress >= 60) return 'bg-emerald-500';
  if (progress >= 30) return 'bg-amber-500';
  return 'bg-red-400';
}

function coverageTone(status: string): string {
  if (status === 'live') return 'bg-emerald-100 text-emerald-800';
  if (status === 'partial') return 'bg-amber-100 text-amber-800';
  return 'bg-muted text-secondary';
}

/** Roadmap внедрения per-framework (T-V33): фазы, прогресс от данных, audit-ready дата. */
export default async function RoadmapPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('roadmap'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  const res = await apiFetch(`/roadmap?locale=${locale}`, {
    headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
  });
  const data: Roadmap = res.ok ? await res.json() : { phaseOrder: [], items: [] };

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <section
        className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
        data-testid="requirements-coverage"
      >
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700 uppercase">
            {t('coverage.kicker')}
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary">{t('coverage.title')}</h2>
              <p className="mt-1 max-w-2xl text-sm text-secondary">{t('coverage.subtitle')}</p>
            </div>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              {t('coverage.count', {
                live: REQUIREMENT_COVERAGE.filter((item) => item.status === 'live').length,
                total: REQUIREMENT_COVERAGE.length,
              })}
            </span>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {REQUIREMENT_COVERAGE.map((item) => (
            <article key={item.key} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {t(`coverage.items.${item.key}.title`)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-secondary">
                    {t(`coverage.items.${item.key}.hint`)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${coverageTone(
                    item.status,
                  )}`}
                >
                  {t(`coverage.status.${item.status}`)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.evidence.map((ev) => (
                  <span
                    key={ev}
                    className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-secondary"
                  >
                    {ev}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {data.items.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="roadmap">
          {data.items.map((it) => (
            <li
              key={it.activationId}
              data-testid={`roadmap-${it.frameworkId}`}
              className="rounded-xl border border-border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{it.name}</span>
                <span className="flex items-center gap-2">
                  {it.auditReady ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      {t('auditReady')}
                    </span>
                  ) : (
                    it.onTrack !== null && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          it.onTrack ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {it.onTrack ? t('onTrack') : t('offTrack')}
                      </span>
                    )
                  )}
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {t('overall')}: {it.overall}%
                  </span>
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2.5">
                {it.phases.map((ph) => (
                  <div key={ph.key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs font-medium text-secondary">
                      {t(`ph.${ph.key}`)}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${barTone(ph.progress)}`}
                        style={{ width: `${ph.progress}%` }}
                        data-testid={`phase-${ph.key}`}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-secondary">
                      {ph.progress}%
                    </span>
                  </div>
                ))}
              </div>

              <form
                action={setTargetDateAction.bind(null, it.activationId)}
                className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-secondary">{t('target')}</span>
                  <input
                    type="date"
                    name="targetDate"
                    defaultValue={it.targetDate ? it.targetDate.slice(0, 10) : ''}
                    className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  data-testid={`target-save-${it.frameworkId}`}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t('setTarget')}
                </button>
                <span className="ml-auto self-center text-xs text-secondary">
                  {it.targetDate
                    ? `${dateFmt.format(new Date(it.targetDate))}${it.elapsedPct !== null ? ` · ${it.elapsedPct}% ${t('elapsed')}` : ''}`
                    : t('noTarget')}
                </span>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
