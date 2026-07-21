import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { StatusBadge } from '@/components/status-badge';
import { filterQuery } from '@/lib/filters';
import { NewEngagementForm } from './new-engagement-form';

const STATES = [
  'draft',
  'manager_review',
  'issued_to_respondents',
  'responses_in_progress',
  'findings_drafting',
  'management_response',
  'approval',
  'report_issued',
  'follow_up',
  'closed',
  'paused',
] as const;

export const dynamic = 'force-dynamic';

interface EngagementRow {
  id: string;
  title: string;
  mode: string;
  state: string;
  subsidiary: string;
  auditType: string | null;
}
interface Subsidiary {
  id: string;
  name: string;
}
interface AuditType {
  code: string;
  name: string;
}
interface WorkflowPhase {
  phase: string;
  order: number;
  states: string[];
  count: number;
  percent: number;
}
interface WorkflowBlocker {
  engagementId: string;
  title: string;
  subsidiary: string;
  state: string;
  phase: string;
  reason: string;
  checklistTotal: number;
  answered: number;
  findings: number;
  dueAt: string | null;
}
interface WorkflowSummary {
  generatedAt: string;
  total: number;
  active: number;
  paused: number;
  closed: number;
  withTeam: number;
  averageProgressPercent: number;
  byPhase: WorkflowPhase[];
  topBlockers: WorkflowBlocker[];
}

/** Список engagement'ов (T-035; ENG-08: Активные/Архив; T-V44: фильтры type/mode; T-117: форма создания). */
export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    archived?: string;
    state?: string;
    mode?: string;
    auditTypeCode?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tStates, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('engagements'),
    getTranslations('engagementStates'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const archived = sp.archived === 'true';

  let engagements: EngagementRow[] = [];
  let subsidiaries: Subsidiary[] = [];
  let auditTypes: AuditType[] = [];
  let workflow: WorkflowSummary | null = null;
  if (tenantSlug) {
    const headers = { 'X-Tenant-Slug': tenantSlug };
    const [eRes, workflowRes, sRes, aRes] = await Promise.all([
      apiFetch(
        `/engagements?locale=${locale}${archived ? '&archived=true' : ''}${filterQuery(sp, ['state', 'mode', 'auditTypeCode'])}`,
        { headers },
      ),
      apiFetch(`/engagements/workflow-summary?locale=${locale}`, { headers }),
      apiFetch(`/subsidiaries?locale=${locale}`, { headers }),
      apiFetch(`/audit-types?locale=${locale}`, { headers }),
    ]);
    engagements = eRes.ok ? await eRes.json() : [];
    workflow = workflowRes.ok ? await workflowRes.json() : null;
    subsidiaries = sRes.ok ? await sRes.json() : [];
    auditTypes = aRes.ok ? await aRes.json() : [];
  }

  const tabCls = (on: boolean) =>
    `rounded-lg px-3.5 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
      on ? 'bg-white text-accent shadow-sm' : 'text-secondary hover:text-foreground'
    }`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6 pt-10 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-accent uppercase">
            {t('workspaceKicker')}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t('title')}</h1>
        </div>
      </div>
      <nav
        data-testid="engagements-view-toggle"
        className="flex w-fit gap-1 rounded-xl border border-border bg-muted/70 p-1"
      >
        <Link href="/engagements" className={tabCls(!archived)}>
          {t('viewActive')}
        </Link>
        <Link href="/engagements?archived=true" className={tabCls(archived)}>
          {t('viewArchived')}
        </Link>
      </nav>
      {!archived && workflow && (
        <section
          data-testid="engagement-workflow-cockpit"
          className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-white shadow-[0_18px_60px_rgba(6,78,59,0.12)]"
        >
          <div className="relative border-b border-emerald-100 bg-[radial-gradient(circle_at_15%_15%,rgba(45,212,191,0.23),transparent_33%),linear-gradient(135deg,#ecfdf5,#ffffff_62%,#f0fdfa)] p-5">
            <div className="absolute right-6 bottom-5 hidden h-20 w-20 rounded-full bg-emerald-300/30 blur-2xl md:block" />
            <p className="text-xs font-semibold tracking-[0.22em] text-emerald-700 uppercase">
              {t('workflow.kicker')}
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-primary">{t('workflow.title')}</h2>
                <p className="mt-1 max-w-2xl text-sm text-secondary">{t('workflow.subtitle')}</p>
              </div>
              <div className="rounded-2xl bg-emerald-950 px-5 py-4 text-center text-white shadow-lg shadow-emerald-950/15">
                <div className="text-3xl font-bold">{workflow.averageProgressPercent}%</div>
                <div className="text-xs text-emerald-100">{t('workflow.avgProgress')}</div>
              </div>
            </div>
            <div className="mt-5 grid gap-2 md:grid-cols-5">
              {workflow.byPhase.map((phase) => (
                <div
                  key={phase.phase}
                  className="rounded-xl border border-white/70 bg-white/75 p-3 shadow-sm backdrop-blur"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-primary">
                      {t(`workflow.phases.${phase.phase}`)}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                      {phase.count}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{ width: `${phase.percent}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-secondary">{phase.percent}%</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                {
                  label: t('workflow.activeAudits'),
                  value: workflow.active,
                  hint: t('workflow.activeHint', { total: workflow.total }),
                },
                {
                  label: t('workflow.teamCoverage'),
                  value: workflow.withTeam,
                  hint: t('workflow.teamHint', { total: workflow.total }),
                },
                {
                  label: t('workflow.pausedClosed'),
                  value: `${workflow.paused}/${workflow.closed}`,
                  hint: t('workflow.pausedClosedHint'),
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

            <div>
              <h3 className="text-sm font-semibold text-primary">{t('workflow.blockersTitle')}</h3>
              <div className="mt-3 flex flex-col gap-2">
                {workflow.topBlockers.length > 0 ? (
                  workflow.topBlockers.map((blocker) => (
                    <Link
                      key={`${blocker.engagementId}-${blocker.reason}`}
                      href={`/engagements/${blocker.engagementId}`}
                      className="group flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-emerald-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground group-hover:text-accent">
                          {blocker.title}
                        </div>
                        <div className="text-xs text-secondary">
                          {blocker.subsidiary} · {tStates(blocker.state)}
                          {blocker.dueAt
                            ? ` · ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(blocker.dueAt))}`
                            : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {t(`workflow.reasons.${blocker.reason}`)}
                        </span>
                        <span className="text-xs text-secondary">
                          {blocker.answered}/{blocker.checklistTotal}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                    {t('workflow.noBlockers')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
      {!archived && (
        <NewEngagementForm
          subsidiaries={subsidiaries}
          auditTypes={auditTypes}
          labels={{
            create: t('createTitle'),
            title: t('name'),
            titlePh: t('titlePh'),
            subsidiary: t('subsidiary'),
            auditType: t('auditType'),
            none: t('none'),
            mode: t('mode'),
            formal: t('modes.formal'),
            light: t('modes.light'),
            periodStart: t('periodStart'),
            periodEnd: t('periodEnd'),
            submit: t('createSubmit'),
            error: t('createError'),
          }}
        />
      )}
      <FilterBar
        basePath="/engagements"
        sp={sp}
        keep={['archived']}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'state',
            label: tFilters('state'),
            options: STATES.map((s) => ({ value: s, label: tStates(s) })),
          },
          ...(auditTypes.length > 0
            ? [
                {
                  param: 'auditTypeCode',
                  label: tFilters('type'),
                  options: auditTypes.map((a) => ({ value: a.code, label: a.name })),
                },
              ]
            : []),
          {
            param: 'mode',
            label: tFilters('mode'),
            options: [
              { value: 'formal', label: t('modes.formal') },
              { value: 'light', label: t('modes.light') },
            ],
          },
        ]}
      />
      <section className="overflow-x-auto rounded-2xl border border-border bg-white/90 shadow-sm">
        <table className="w-full text-left text-sm" data-testid="engagements-table">
          <thead>
            <tr className="border-b border-border bg-muted/35 text-[11px] tracking-wide text-secondary uppercase">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('subsidiary')}</th>
              <th className="px-4 py-3 font-medium">{t('auditType')}</th>
              <th className="px-4 py-3 font-medium">{t('mode')}</th>
              <th className="px-4 py-3 font-medium">{t('state')}</th>
            </tr>
          </thead>
          <tbody>
            {engagements.map((e) => (
              <tr key={e.id} className="border-b border-border/80 last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/engagements/${e.id}`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {e.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-secondary">{e.subsidiary}</td>
                <td className="px-4 py-3 text-secondary">{e.auditType ?? '—'}</td>
                <td className="px-4 py-3 text-secondary">{t(`modes.${e.mode}`)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={e.state === 'closed' ? 'success' : 'info'} dot>
                    {tStates(e.state)}
                  </StatusBadge>
                </td>
              </tr>
            ))}
            {engagements.length === 0 && (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
