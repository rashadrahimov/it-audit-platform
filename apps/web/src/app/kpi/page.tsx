import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createKpiAction, measureKpiAction } from './actions';

export const dynamic = 'force-dynamic';

interface Control {
  id: string;
  ref: string;
  objective: string | null;
}
interface Kpi {
  id: string;
  name: string;
  unit: string | null;
  target: number | null;
  current: number | null;
  direction: 'higher_better' | 'lower_better';
  onTrack: boolean | null;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** KPI контролей (T-106): выбор контроля → список KPI, создание, замер значения. */
export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ controlId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('kpi'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const ctrlRes = await apiFetch('/controls', { headers });
  const controls: Control[] = ctrlRes.ok ? await ctrlRes.json() : [];
  const controlId = sp.controlId ?? controls[0]?.id;

  let kpis: Kpi[] = [];
  if (controlId) {
    const kpiRes = await apiFetch(`/control-kpis?controlId=${encodeURIComponent(controlId)}`, { headers });
    kpis = kpiRes.ok ? await kpiRes.json() : [];
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      {/* Выбор контроля */}
      <form method="GET" data-testid="kpi-control-select" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          {t('control')}
          <select name="controlId" defaultValue={controlId} className={inputCls}>
            {controls.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ref}
                {c.objective ? ` — ${c.objective}` : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('show')}
        </button>
      </form>

      {controlId && (
        <>
          {/* Создание KPI */}
          <form action={createKpiAction} data-testid="kpi-create" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
            <input type="hidden" name="controlId" value={controlId} />
            <input name="name" required placeholder={t('namePh')} className={`flex-1 ${inputCls}`} />
            <input name="unit" placeholder={t('unit')} className={`w-20 ${inputCls}`} />
            <input name="targetValue" type="number" step="any" placeholder={t('target')} className={`w-24 ${inputCls}`} />
            <input name="currentValue" type="number" step="any" placeholder={t('current')} className={`w-24 ${inputCls}`} />
            <select name="direction" defaultValue="higher_better" className={inputCls}>
              <option value="higher_better">{t('dir.higher_better')}</option>
              <option value="lower_better">{t('dir.lower_better')}</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('add')}
            </button>
          </form>

          {kpis.length === 0 ? (
            <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">{t('empty')}</section>
          ) : (
            <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <table className="w-full text-left text-sm" data-testid="kpi-table">
                <thead>
                  <tr className="border-b border-border text-secondary">
                    <th className="px-4 py-3 font-medium">{t('name')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('target')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('current')}</th>
                    <th className="px-4 py-3 font-medium">{t('state')}</th>
                    <th className="px-4 py-3 font-medium">{t('measure')}</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((k) => (
                    <tr key={k.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {k.name}
                        {k.unit && <span className="ml-1 text-xs text-secondary">({k.unit})</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-secondary">{k.target ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{k.current ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            k.onTrack === null
                              ? 'bg-muted text-secondary'
                              : k.onTrack
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {k.onTrack === null ? '—' : k.onTrack ? t('onTrack') : t('offTrack')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <form action={measureKpiAction} className="flex gap-1">
                          <input type="hidden" name="id" value={k.id} />
                          <input
                            name="currentValue"
                            type="number"
                            step="any"
                            required
                            placeholder={t('value')}
                            className={`w-20 ${inputCls} px-2 py-1 text-xs`}
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {t('save')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </main>
  );
}
