import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
interface Cell {
  impact: number;
  likelihood: number;
  count: number;
  cellClass: RiskClass | null;
}
interface Node {
  id: string;
  kind: string;
  name: string;
}
interface Matrix {
  mode: 'inherent' | 'residual';
  impactScale: number;
  likelihoodScale: number;
  total: number;
  cells: Cell[];
  topCategories: Array<{ category: string; count: number }>;
  nodes: Node[];
  nodeId: string | null;
}

/** Заливка ячейки по классу (число+цвет — семантика не только цветом). */
const CELL_TONE: Record<RiskClass, string> = {
  low: 'bg-emerald-100 text-emerald-900',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-orange-200 text-orange-900',
  critical: 'bg-red-300 text-red-950',
};

/** Risk heat map (T-058, T-V35): настоящая матрица impact×likelihood, срез по процессу. */
export default async function RiskHeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; nodeId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('riskHeatmap'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);

  const mode = sp.mode === 'residual' ? 'residual' : 'inherent';
  const nodeId = sp.nodeId && /^[0-9a-f-]{36}$/i.test(sp.nodeId) ? sp.nodeId : '';
  const qs = new URLSearchParams({ mode, locale });
  if (nodeId) qs.set('nodeId', nodeId);

  const res = await apiFetch(`/risks/heatmap-matrix?${qs.toString()}`, {
    headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
  });
  const data: Matrix | null = res.ok ? await res.json() : null;

  const cellAt = (impact: number, likelihood: number): Cell | undefined =>
    data?.cells.find((c) => c.impact === impact && c.likelihood === likelihood);

  // строки — impact сверху вниз (max наверху), колонки — likelihood слева направо
  const impacts = data
    ? Array.from({ length: data.impactScale }, (_, i) => data.impactScale - i)
    : [];
  const likelihoods = data ? Array.from({ length: data.likelihoodScale }, (_, i) => i + 1) : [];

  const tab = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
      on ? 'bg-accent text-on-primary' : 'text-secondary hover:bg-muted'
    }`;
  const modeHref = (m: 'inherent' | 'residual') => {
    const q = new URLSearchParams({ mode: m });
    if (nodeId) q.set('nodeId', nodeId);
    return `/risk-heatmap?${q.toString()}`;
  };
  const nodeHref = (nid: string) => {
    const q = new URLSearchParams({ mode });
    if (nid) q.set('nodeId', nid);
    return `/risk-heatmap?${q.toString()}`;
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {!data || data.total === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <nav data-testid="heatmap-mode" className="flex gap-1">
              <Link href={modeHref('inherent')} className={tab(mode === 'inherent')}>
                {t('inherent')}
              </Link>
              <Link href={modeHref('residual')} className={tab(mode === 'residual')}>
                {t('residual')}
              </Link>
            </nav>
            {data.nodes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" data-testid="heatmap-process">
                <span className="text-xs font-medium text-secondary">{t('process')}:</span>
                <Link
                  href={nodeHref('')}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${!nodeId ? 'bg-accent text-on-primary' : 'bg-muted text-secondary hover:bg-border'}`}
                >
                  {t('allProcesses')}
                </Link>
                {data.nodes.map((n) => (
                  <Link
                    key={n.id}
                    href={nodeHref(n.id)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${nodeId === n.id ? 'bg-accent text-on-primary' : 'bg-muted text-secondary hover:bg-border'}`}
                  >
                    {n.name}
                  </Link>
                ))}
              </div>
            )}
            <span className="ml-auto text-sm text-secondary">
              {data.total} {t('risks')}
            </span>
          </div>

          <section className="overflow-x-auto rounded-xl border border-border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-primary">{t('matrix')}</h2>
            <div className="flex gap-2">
              <div className="flex items-center">
                <span className="text-xs font-medium tracking-wide text-secondary [writing-mode:vertical-rl] rotate-180">
                  {t('impact')} →
                </span>
              </div>
              <div className="flex-1">
                <table className="w-full border-collapse" data-testid="heatmap-matrix">
                  <tbody>
                    {impacts.map((impact) => (
                      <tr key={impact}>
                        <td className="w-8 pr-2 text-right text-xs font-medium text-secondary tabular-nums">
                          {impact}
                        </td>
                        {likelihoods.map((likelihood) => {
                          const cell = cellAt(impact, likelihood);
                          const tone = cell?.cellClass
                            ? CELL_TONE[cell.cellClass]
                            : 'bg-muted/40 text-secondary';
                          return (
                            <td key={likelihood} className="p-0.5">
                              <div
                                data-testid={`cell-${impact}-${likelihood}`}
                                className={`flex h-12 items-center justify-center rounded-md text-sm font-bold tabular-nums ${tone}`}
                                title={`${t('impact')} ${impact} · ${t('likelihood')} ${likelihood}`}
                              >
                                {cell && cell.count > 0 ? cell.count : ''}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td />
                      {likelihoods.map((l) => (
                        <td
                          key={l}
                          className="pt-1 text-center text-xs font-medium text-secondary tabular-nums"
                        >
                          {l}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1 text-center text-xs font-medium tracking-wide text-secondary">
                  {t('likelihood')} →
                </p>
              </div>
            </div>
          </section>

          {data.topCategories.length > 0 && (
            <section
              className="flex flex-col gap-2 rounded-xl border border-border bg-white p-5 shadow-sm"
              data-testid="heatmap-categories"
            >
              <h2 className="text-sm font-semibold text-primary">{t('topCategories')}</h2>
              <ul className="flex flex-col gap-1.5">
                {data.topCategories.map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">
                      {c.category === 'uncategorized' ? t('uncategorized') : c.category}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${Math.max(8, (c.count / data.total) * 120)}px` }}
                      />
                      <span className="w-6 text-right text-xs font-medium tabular-nums text-secondary">
                        {c.count}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
