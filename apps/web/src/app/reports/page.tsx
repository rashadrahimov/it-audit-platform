import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';

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

const ENTITIES = ['findings', 'risks', 'controls'];
const FORMATS = ['csv', 'xml'];

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
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('reports'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const snapRes = await apiFetch('/snapshots', { headers });
  const snapshots: Snapshot[] = snapRes.ok ? await snapRes.json() : [];

  let compare: CompareResult | null = null;
  if (sp.a && sp.b) {
    const cmpRes = await apiFetch(
      `/reports/compare?a=${encodeURIComponent(sp.a)}&b=${encodeURIComponent(sp.b)}`,
      { headers },
    );
    if (cmpRes.ok) compare = await cmpRes.json();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

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
