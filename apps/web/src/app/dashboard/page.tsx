import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface Counts {
  engagementsByState: Record<string, number>;
  findingsByRating: Record<string, number>;
  findingsByStatus: Record<string, number>;
  openFindings: number;
}

/** T-IR07: метрики инцидент-менеджмента для виджета на дашборде. */
interface IncidentMetrics {
  total: number;
  open: number;
  bySeverity: Record<string, number>;
  meanHours: { toTriage: number | null; toContain: number | null; toRecover: number | null };
  regulator: { reportable: number; notified: number; onTime: number; overdue: number };
}

interface Summary {
  scope: string;
  group: Counts;
  subsidiaries: Array<{ id: string; name: string } & Counts>;
  departments: Array<{ id: string; name: string; subsidiaryId: string | null } & Counts>;
}

const RATINGS = ['critical', 'high', 'medium', 'low'] as const;

function ratingClass(rating: string): string {
  if (rating === 'critical' || rating === 'high') return 'text-red-700';
  if (rating === 'medium') return 'text-amber-700';
  return 'text-secondary';
}

/** Дашборды трёх уровней (T-044): группа / дочка / департамент на /group/summary. */
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tRatings, locale, tenantSlug] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('engagementDetail.ratings'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  let summary: Summary | null = null;
  let incidents: IncidentMetrics | null = null;
  if (tenantSlug) {
    const [res, incRes] = await Promise.all([
      apiFetch(`/group/summary?locale=${locale}`, { headers: { 'X-Tenant-Slug': tenantSlug } }),
      apiFetch('/incidents/metrics', { headers: { 'X-Tenant-Slug': tenantSlug } }),
    ]);
    if (res.ok) summary = await res.json();
    if (incRes.ok) incidents = await incRes.json();
  }

  if (!summary) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-sm text-secondary">{t('noAccess')}</p>
      </main>
    );
  }

  const totalFindings = Object.values(summary.group.findingsByStatus).reduce((a, b) => a + b, 0);
  const totalEngagements = Object.values(summary.group.engagementsByState).reduce(
    (a, b) => a + b,
    0,
  );

  const ratingCells = (counts: Counts) =>
    RATINGS.map((r) => (
      <td key={r} className={`px-3 py-2 text-right tabular-nums ${ratingClass(r)}`}>
        {counts.findingsByRating[r] ?? 0}
      </td>
    ));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* Уровень 1: KPI группы */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="dashboard-kpi">
        {[
          { label: t('openFindings'), value: summary.group.openFindings, accent: true },
          { label: t('totalFindings'), value: totalFindings },
          { label: t('engagements'), value: totalEngagements },
          { label: t('subsidiaries'), value: summary.subsidiaries.length },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <div
              className={`text-3xl font-bold tabular-nums ${kpi.accent ? 'text-accent' : 'text-primary'}`}
            >
              {kpi.value}
            </div>
            <div className="mt-1 text-xs font-medium tracking-wide text-secondary uppercase">
              {kpi.label}
            </div>
          </div>
        ))}
      </section>

      {/* T-IR07: инцидент-менеджмент — скорость реагирования и регуляторные сроки */}
      {incidents && incidents.total > 0 && (
        <section data-testid="dashboard-incidents">
          <h2 className="mb-3 text-sm font-semibold text-primary">{t('incidents')}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: t('incidentsOpen'), value: incidents.open, accent: true },
              {
                label: t('incidentsCritical'),
                value: (incidents.bySeverity.critical ?? 0) + (incidents.bySeverity.high ?? 0),
              },
              {
                label: t('incidentsMttr'),
                value:
                  incidents.meanHours.toRecover === null
                    ? '—'
                    : `${incidents.meanHours.toRecover} ч`,
              },
              {
                label: t('incidentsNotifyOverdue'),
                value: incidents.regulator.overdue,
                danger: incidents.regulator.overdue > 0,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-border bg-white p-4 shadow-sm"
              >
                <div
                  className={`text-3xl font-bold tabular-nums ${
                    kpi.danger ? 'text-red-700' : kpi.accent ? 'text-accent' : 'text-primary'
                  }`}
                >
                  {kpi.value}
                </div>
                <div className="mt-1 text-xs font-medium tracking-wide text-secondary uppercase">
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Уровень 2: по дочкам */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('bySubsidiary')}</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="dashboard-subsidiaries">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-3 py-2 font-medium">{t('name')}</th>
                {RATINGS.map((r) => (
                  <th key={r} className="px-3 py-2 text-right font-medium">
                    {tRatings(r)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">{t('open')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.subsidiaries.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                  {ratingCells(s)}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {s.openFindings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Уровень 3: по департаментам */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('byDepartment')}</h2>
        {summary.departments.length === 0 ? (
          <p className="text-sm text-secondary">{t('noDepartments')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-left text-sm" data-testid="dashboard-departments">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="px-3 py-2 font-medium">{t('name')}</th>
                  <th className="px-3 py-2 font-medium">{t('level')}</th>
                  {RATINGS.map((r) => (
                    <th key={r} className="px-3 py-2 text-right font-medium">
                      {tRatings(r)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">{t('open')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.departments.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{d.name}</td>
                    <td className="px-3 py-2 text-secondary">
                      {d.subsidiaryId ? t('levelSubsidiary') : t('levelGroup')}
                    </td>
                    {ratingCells(d)}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                      {d.openFindings}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
