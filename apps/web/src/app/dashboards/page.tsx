import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

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

/** Оттенок бара по ключу-классу; нейтральный по умолчанию (метка+число несут смысл без цвета). */
const BAR_TONE: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  non_compliant: 'bg-red-500',
  overdue: 'bg-red-500',
  medium: 'bg-amber-500',
  due_soon: 'bg-amber-500',
  low: 'bg-emerald-500',
  compliant: 'bg-emerald-500',
  ok: 'bg-emerald-500',
};

/** Чарт-дашборды (T-072): виджеты с живыми метриками, горизонтальные бары. */
export default async function DashboardsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('chartDashboards'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/dashboards', { headers });
  const list: DashboardRow[] = res.ok ? await res.json() : [];
  const dashboards = await Promise.all(
    list.map(async (d) => {
      const dRes = await apiFetch(`/dashboards/${d.id}/data`, { headers });
      return (dRes.ok ? await dRes.json() : null) as DashboardData | null;
    }),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {list.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <div className="flex flex-col gap-8" data-testid="dashboards">
          {dashboards.filter(Boolean).map((d) => (
            <section key={d!.id} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-foreground">{d!.name}</h2>
                <span className="text-sm text-secondary">
                  · {d!.widgets.length} {t('widgets')}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {d!.widgets.map((w) => {
                  const entries = Object.entries(w.data);
                  const max = Math.max(1, ...entries.map(([, v]) => v));
                  return (
                    <div
                      key={w.metric}
                      className="rounded-xl border border-border bg-white p-4 shadow-sm"
                    >
                      <p className="mb-3 text-sm font-medium text-secondary">{w.title}</p>
                      {entries.length === 0 ? (
                        <p className="text-sm text-secondary">—</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {entries.map(([key, value]) => (
                            <li key={key} className="flex items-center gap-2 text-sm">
                              <span className="w-28 shrink-0 truncate text-foreground" title={key}>
                                {key}
                              </span>
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <span
                                  className={`block h-full rounded-full ${BAR_TONE[key] ?? 'bg-accent'}`}
                                  style={{ width: `${(value / max) * 100}%` }}
                                />
                              </span>
                              <span className="w-8 shrink-0 text-right font-medium tabular-nums text-foreground">
                                {value}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
