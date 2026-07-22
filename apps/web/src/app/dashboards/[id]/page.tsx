import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { WidgetChart } from '@/components/widget-chart';
import { deleteDashboardAction, updateDashboardAction } from '../actions';
import { WidgetSlots } from '../widget-slots';

export const dynamic = 'force-dynamic';

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

/** Страница отдельного дашборда (T-V15): рендер + правка + PDF + удаление. */
export default async function DashboardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, { id }] = await Promise.all([
    getTranslations('chartDashboards'),
    getActiveTenantSlug(),
    params,
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const [res, mRes] = await Promise.all([
    apiFetch(`/dashboards/${id}/data`, { headers }),
    apiFetch('/dashboards/metrics', { headers }),
  ]);
  if (!res.ok) redirect('/dashboards');
  const d: DashboardData = await res.json();
  const metrics: string[] = mRes.ok ? (await mRes.json()).metrics : METRICS;

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
      <div>
        <Link
          href="/dashboards"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          ← {t('back')}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3" data-testid="dashboard-header">
        <h1 className="text-2xl font-bold text-primary">{d.name}</h1>
        <a
          href={`/dashboards/${d.id}/pdf`}
          data-testid="dashboard-pdf"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('exportPdf')}
        </a>
        <form action={deleteDashboardAction.bind(null, d.id)}>
          <button
            type="submit"
            data-testid="dashboard-delete"
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('delete')}
          </button>
        </form>
      </header>

      <div className="grid gap-4 sm:grid-cols-2" data-testid="dashboard-widgets">
        {d.widgets.map((w, i) => (
          <div
            key={`${w.metric}-${i}`}
            className="rounded-xl border border-border bg-white p-4 shadow-sm"
            data-charttype={w.chartType}
          >
            <p className="mb-3 text-sm font-medium text-secondary">{w.title}</p>
            <WidgetChart chartType={w.chartType} data={w.data} ariaLabel={w.title} />
          </div>
        ))}
      </div>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="dashboard-edit"
      >
        <h2 className="text-sm font-semibold text-primary">{t('edit')}</h2>
        <form action={updateDashboardAction.bind(null, d.id)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('namePh')}</span>
            <input
              name="name"
              defaultValue={d.name}
              required
              className="rounded-md border border-border px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
          <WidgetSlots
            metrics={metrics}
            values={d.widgets.map((w) => ({
              metric: w.metric,
              chartType: w.chartType,
              title: w.title,
            }))}
            labels={slotLabels}
          />
          <div>
            <button
              type="submit"
              data-testid="dashboard-save"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
