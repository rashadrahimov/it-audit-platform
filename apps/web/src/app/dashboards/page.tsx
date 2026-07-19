import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { WidgetChart } from '@/components/widget-chart';
import { createDashboardAction } from './actions';
import { WidgetSlots } from './widget-slots';

export const dynamic = 'force-dynamic';

interface DashboardRow {
  id: string;
  name: string;
  widgets: number;
}
interface Widget {
  metric: string;
  chartType: string;
  title: string;
  data: Record<string, number>;
}
interface DashboardData {
  id: string;
  name: string;
  widgets: Widget[];
}

const METRICS = [
  'findings_by_status',
  'findings_by_severity',
  'tests_by_status',
  'vendors_by_risk',
  'risks_by_class',
  'devices_compliance',
  'controls_total',
  'tests_passing',
  'documents_readiness',
  'vendors_by_category',
  'risks_by_treatment',
  'trust_requests',
  'questionnaires_by_status',
  'commitments_by_status',
];

/** Чарт-дашборды (T-072 → T-V15): конструктор, честный рендер chartType, PDF. */
export default async function DashboardsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('chartDashboards'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [res, mRes] = await Promise.all([
    apiFetch('/dashboards', { headers }),
    apiFetch('/dashboards/metrics', { headers }),
  ]);
  const list: DashboardRow[] = res.ok ? await res.json() : [];
  const metrics: string[] = mRes.ok ? (await mRes.json()).metrics : METRICS;
  const dashboards = await Promise.all(
    list.map(async (d) => {
      const dRes = await apiFetch(`/dashboards/${d.id}/data`, { headers });
      return (dRes.ok ? await dRes.json() : null) as DashboardData | null;
    }),
  );

  const slotLabels = {
    slot: t('slot'),
    metric: t('metric'),
    chartType: t('chartType'),
    widgetTitle: t('widgetTitle'),
    none: '—',
    metricLabel: (m: string) => (METRICS.includes(m) ? t(`m.${m}`) : m),
    chartLabel: (c: string) => t(`ct.${c}`),
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form
        action={createDashboardAction}
        data-testid="dashboard-create"
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('create')}</span>
          <input
            name="name"
            required
            placeholder={t('namePh')}
            className="rounded-md border border-border px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <WidgetSlots metrics={metrics} labels={slotLabels} />
        <div>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('add')}
          </button>
        </div>
      </form>

      {list.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <div className="flex flex-col gap-8" data-testid="dashboards">
          {dashboards.filter(Boolean).map((d) => (
            <section key={d!.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <Link
                  href={`/dashboards/${d!.id}`}
                  className="text-lg font-semibold text-foreground underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                >
                  {d!.name}
                </Link>
                <span className="text-sm text-secondary">
                  · {d!.widgets.length} {t('widgets')}
                </span>
                <a
                  href={`/dashboards/${d!.id}/pdf`}
                  className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  data-testid="dashboard-pdf"
                >
                  PDF
                </a>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {d!.widgets.map((w, i) => (
                  <div
                    key={`${w.metric}-${i}`}
                    className="rounded-xl border border-border bg-white p-4 shadow-sm"
                    data-charttype={w.chartType}
                  >
                    <p className="mb-3 text-sm font-medium text-secondary">{w.title}</p>
                    <WidgetChart chartType={w.chartType} data={w.data} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
