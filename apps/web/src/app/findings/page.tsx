import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { filterQuery } from '@/lib/filters';
import { createFindingFromTemplateAction } from './actions';

export const dynamic = 'force-dynamic';

interface FindingRow {
  id: string;
  title: string;
  riskRating: string;
  status: string;
  slaStatus: string | null;
  dueDate: string | null;
  owner: string | null;
  auditor: string | null;
}

interface FollowUpItem extends FindingRow {
  nextAction: string;
  lane: 'remediation' | 'retest' | 'monitor';
  priorityScore: number;
  daysUntilDue: number | null;
  daysPastDue: number | null;
}

interface FollowUpPlan {
  summary: {
    openFindings: number;
    remediationQueue: number;
    readyForRetest: number;
    overdue: number;
    dueSoon: number;
    unassigned: number;
  };
  lanes: {
    remediation: FollowUpItem[];
    retest: FollowUpItem[];
    monitor: FollowUpItem[];
  };
}

const STATUSES = [
  'identified',
  'assigned',
  'in_progress',
  'remediated',
  'pending_retest',
  'closed',
] as const;
const RATINGS = ['critical', 'high', 'medium', 'low', 'not_applicable'] as const;
const SLAS = ['ok', 'due_soon', 'overdue'] as const;

const RATING_TONE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
  not_applicable: 'bg-muted text-secondary',
};
const SLA_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

/** Реестр findings тенанта (T-V03): фильтры + SLA-бейджи + ссылки на карточки. */
export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    riskRating?: string;
    slaStatus?: string;
    mine?: string;
    tagId?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('findings'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);

  let findings: FindingRow[] = [];
  let followUp: FollowUpPlan | null = null;
  let templates: Array<{ key: string; title: string; riskRating: string; recommendation: string }> =
    [];
  let tags: Array<{ id: string; name: string }> = [];
  if (tenantSlug) {
    const [res, followUpRes, tplRes, tagsRes] = await Promise.all([
      apiFetch(
        `/findings?locale=${locale}${filterQuery(sp, ['status', 'riskRating', 'slaStatus', 'mine', 'tagId'])}`,
        { headers: { 'X-Tenant-Slug': tenantSlug } },
      ),
      apiFetch(`/findings/follow-up-plan?locale=${locale}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
      apiFetch(`/findings/templates?locale=${locale}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
      apiFetch('/tags', { headers: { 'X-Tenant-Slug': tenantSlug } }),
    ]);
    findings = res.ok ? await res.json() : [];
    followUp = followUpRes.ok ? await followUpRes.json() : null;
    templates = tplRes.ok ? await tplRes.json() : [];
    tags = tagsRes.ok ? await tagsRes.json() : [];
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <FilterBar
        basePath="/findings"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'mine',
            label: tFilters('scope'),
            options: [{ value: 'true', label: tFilters('ownedByMe') }],
          },
          {
            param: 'status',
            label: tFilters('status'),
            options: STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) })),
          },
          {
            param: 'riskRating',
            label: t('colRating'),
            options: RATINGS.map((r) => ({ value: r, label: t(`ratings.${r}`) })),
          },
          {
            param: 'slaStatus',
            label: t('colSla'),
            options: SLAS.map((s) => ({ value: s, label: t(`slas.${s}`) })),
          },
          ...(tags.length > 0
            ? [
                {
                  param: 'tagId',
                  label: tFilters('tag'),
                  options: tags.map((tg) => ({ value: tg.id, label: tg.name })),
                },
              ]
            : []),
        ]}
      />
      {followUp && (
        <section
          className="flex flex-col gap-4 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/70 to-teal-50/80 p-4 shadow-sm"
          data-testid="finding-follow-up-plan"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
                {t('followUpKicker')}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-primary">{t('followUpTitle')}</h2>
              <p className="mt-1 max-w-2xl text-sm text-secondary">{t('followUpHint')}</p>
            </div>
            <Link
              href="/findings?status=pending_retest"
              className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-accent shadow-xs transition-colors hover:bg-emerald-50"
            >
              {t('followUpRetestLink')}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {(
              [
                ['openFindings', followUp.summary.openFindings],
                ['remediationQueue', followUp.summary.remediationQueue],
                ['readyForRetest', followUp.summary.readyForRetest],
                ['overdue', followUp.summary.overdue],
                ['dueSoon', followUp.summary.dueSoon],
                ['unassigned', followUp.summary.unassigned],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-white/80 px-3 py-2 shadow-xs">
                <div className="text-xl font-bold text-primary tabular-nums">{value}</div>
                <div className="text-[11px] font-medium text-secondary">
                  {t(`followUpSummary.${key}`)}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(
              [
                ['remediation', followUp.lanes.remediation],
                ['retest', followUp.lanes.retest],
              ] as const
            ).map(([lane, items]) => (
              <div key={lane} className="rounded-xl border border-white/70 bg-white/75 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-primary">
                    {t(`followUpLanes.${lane}`)}
                  </h3>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    {items.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {items.slice(0, 4).map((item) => (
                    <li key={item.id} className="rounded-lg bg-white px-3 py-2 shadow-xs">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/findings/${item.id}`}
                          className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
                        >
                          {item.title}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${RATING_TONE[item.riskRating] ?? 'bg-muted text-secondary'}`}
                        >
                          {t(`ratings.${item.riskRating}`)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-secondary">
                        <span>{t(`nextActions.${item.nextAction}`)}</span>
                        <span>·</span>
                        <span>{item.owner ?? t('unassigned')}</span>
                        {item.daysPastDue !== null && (
                          <>
                            <span>·</span>
                            <span className="font-semibold text-red-700">
                              {t('daysPastDue', { days: item.daysPastDue })}
                            </span>
                          </>
                        )}
                        {item.daysUntilDue !== null && (
                          <>
                            <span>·</span>
                            <span>{t('daysUntilDue', { days: item.daysUntilDue })}</span>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                  {items.length === 0 && (
                    <li className="rounded-lg bg-white px-3 py-2 text-sm text-secondary shadow-xs">
                      {t('followUpEmpty')}
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="findings-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('colTitle')}</th>
              <th className="px-4 py-3 font-medium">{t('colRating')}</th>
              <th className="px-4 py-3 font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('colSla')}</th>
              <th className="px-4 py-3 font-medium">{t('colOwner')}</th>
              <th className="px-4 py-3 font-medium">{t('colDue')}</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/findings/${f.id}`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {f.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RATING_TONE[f.riskRating] ?? 'bg-muted text-secondary'}`}
                  >
                    {t(`ratings.${f.riskRating}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-secondary">
                    {t(`statuses.${f.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {f.slaStatus ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SLA_TONE[f.slaStatus] ?? 'bg-muted text-secondary'}`}
                    >
                      {t(`slas.${f.slaStatus}`)}
                    </span>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-secondary">{f.owner ?? '—'}</td>
                <td className="px-4 py-3 text-secondary tabular-nums">
                  {f.dueDate ? dateFmt.format(new Date(f.dueDate)) : '—'}
                </td>
              </tr>
            ))}
            {findings.length === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {templates.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="finding-templates"
        >
          <h2 className="text-sm font-semibold text-primary">{t('templates')}</h2>
          <p className="text-xs text-secondary">{t('templatesHint')}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((tpl) => (
              <li
                key={tpl.key}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RATING_TONE[tpl.riskRating] ?? 'bg-muted text-secondary'}`}
                  >
                    {t(`ratings.${tpl.riskRating}`)}
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">{tpl.title}</span>
                </span>
                <form action={createFindingFromTemplateAction.bind(null, tpl.key)}>
                  <button
                    type="submit"
                    data-testid="finding-template-create"
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t('useTemplate')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
