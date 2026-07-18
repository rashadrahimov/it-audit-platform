import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
const CLASSES: RiskClass[] = ['low', 'medium', 'high', 'critical'];

interface Heatmap {
  total: number;
  inherent: Record<RiskClass, number>;
  residual: Record<RiskClass, number>;
}

/** Цвет ячейки по классу — но метка (Low/High…) и число дают семантику без опоры на цвет. */
const CLASS_CELL: Record<RiskClass, string> = {
  low: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  high: 'bg-orange-50 text-orange-800 ring-orange-200',
  critical: 'bg-red-50 text-red-800 ring-red-200',
};

/** Risk heat map (T-058): распределение рисков по классам, присущий vs остаточный. */
export default async function RiskHeatmapPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('riskHeatmap'),
    getActiveTenantSlug(),
  ]);

  const res = await apiFetch('/risks/heatmap', {
    headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
  });
  const empty: Record<RiskClass, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const data: Heatmap = res.ok
    ? await res.json()
    : { total: 0, inherent: empty, residual: empty };

  const rows: Array<{ key: 'inherent' | 'residual'; values: Record<RiskClass, number> }> = [
    { key: 'inherent', values: data.inherent },
    { key: 'residual', values: data.residual },
  ];

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

      <p className="text-sm text-secondary">
        {data.total} {t('total')}
      </p>

      {data.total === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white p-4 shadow-sm">
          <table className="w-full border-separate border-spacing-2" data-testid="risk-heatmap">
            <thead>
              <tr>
                <th className="w-28" />
                {CLASSES.map((cls) => (
                  <th key={cls} className="px-2 pb-1 text-xs font-medium text-secondary">
                    {t(`cls.${cls}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th className="pr-2 text-left text-sm font-semibold text-foreground whitespace-nowrap">
                    {t(row.key)}
                  </th>
                  {CLASSES.map((cls) => (
                    <td key={cls}>
                      <div
                        className={`flex h-16 flex-col items-center justify-center rounded-lg ring-1 ring-inset ${CLASS_CELL[cls]}`}
                        title={`${t(row.key)} · ${t(`cls.${cls}`)}: ${row.values[cls]}`}
                      >
                        <span className="text-lg font-bold tabular-nums">{row.values[cls]}</span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
