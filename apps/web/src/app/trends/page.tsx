import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocalized, type I18nText } from '@it-audit/shared';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface SnapshotRow {
  id: string;
  label: string;
  capturedAt: string;
}
interface SnapshotDetail extends SnapshotRow {
  metrics: Record<string, Record<string, number>>;
}
interface SnapshotDiff {
  baseline: SnapshotRow | null;
  currentAt: string;
  counts: {
    baselineOpen: number;
    currentOpen: number;
    new: number;
    remediated: number;
    changed: number;
    unchanged: number;
  };
  findings: Array<{
    id: string;
    title: I18nText;
    riskRating: string;
    status: string;
    previousRiskRating: string | null;
    previousStatus: string | null;
    change:
      'new' | 'remediated' | 'risk_escalated' | 'risk_reduced' | 'status_changed' | 'unchanged';
  }>;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const cardCls = 'rounded-xl border border-border bg-white p-5 shadow-sm';

const CHANGE_TONE: Record<string, string> = {
  new: 'bg-amber-100 text-amber-900',
  remediated: 'bg-emerald-100 text-emerald-900',
  risk_escalated: 'bg-red-100 text-red-900',
  risk_reduced: 'bg-emerald-100 text-emerald-900',
  status_changed: 'bg-sky-100 text-sky-900',
  unchanged: 'bg-muted text-secondary',
};

/** SVG-полилиния тренда (RSK-08 subset, T-A22). */
function TrendChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const W = 640;
  const H = 200;
  const pad = 28;
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const coords = points.map((p, i) => `${x(i)},${y(p.value)}`);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" data-testid="trend-svg">
      {/* базовая линия */}
      <line
        x1={pad}
        y1={H - pad}
        x2={W - pad}
        y2={H - pad}
        stroke="var(--color-border, #dce8e1)"
        strokeWidth="1"
      />
      <polyline
        fill="none"
        stroke="var(--color-accent, #07865F)"
        strokeWidth="2"
        points={coords.join(' ')}
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="var(--color-accent, #07865F)" />
          <text
            x={x(i)}
            y={y(p.value) - 8}
            textAnchor="middle"
            fontSize="11"
            fill="var(--color-foreground, #10231c)"
          >
            {p.value}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Тренды метрик по снапшотам (RSK-08 subset, T-A22): серия значения во времени. */
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; key?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('trends'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const locale = await getCurrentLocale();
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [listRes, diffRes] = await Promise.all([
    apiFetch('/snapshots', { headers }),
    apiFetch('/snapshots/latest-diff', { headers }),
  ]);
  const rows: SnapshotRow[] = listRes.ok ? await listRes.json() : [];
  const diff: SnapshotDiff | null = diffRes.ok ? await diffRes.json() : null;
  // хронологический порядок
  rows.sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  const details = await Promise.all(
    rows.map(async (r) => {
      const dRes = await apiFetch(`/snapshots/${r.id}`, { headers });
      return dRes.ok ? ((await dRes.json()) as SnapshotDetail) : null;
    }),
  );
  const snaps = details.filter((d): d is SnapshotDetail => d !== null);

  const groups = Array.from(new Set(snaps.flatMap((s) => Object.keys(s.metrics)))).sort();
  const group = sp.group && groups.includes(sp.group) ? sp.group : groups[0];
  const keys = group
    ? Array.from(new Set(snaps.flatMap((s) => Object.keys(s.metrics[group] ?? {})))).sort()
    : [];
  const key = sp.key && keys.includes(sp.key) ? sp.key : keys[0];

  const series =
    group && key ? snaps.map((s) => ({ label: s.label, value: s.metrics[group]?.[key] ?? 0 })) : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {diff?.baseline && (
        <section className={cardCls} data-testid="snapshot-latest-diff">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
                {t('followUpKicker')}
              </p>
              <h2 className="text-lg font-semibold text-primary">{t('followUpTitle')}</h2>
              <p className="mt-1 text-sm text-secondary">
                {t('baseline')}: {diff.baseline.label}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
              {t('currentOpen')}: {diff.counts.currentOpen}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            {(
              [
                ['new', diff.counts.new],
                ['remediated', diff.counts.remediated],
                ['changed', diff.counts.changed],
                ['unchanged', diff.counts.unchanged],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-muted/60 p-3">
                <dd className="text-2xl font-bold tabular-nums text-primary">{value}</dd>
                <dt className="text-xs text-secondary">{t(key)}</dt>
              </div>
            ))}
          </dl>
          {diff.findings.length > 0 ? (
            <ul className="mt-4 grid gap-2">
              {diff.findings.map((finding) => (
                <li
                  key={`${finding.id}-${finding.change}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 p-3"
                >
                  <div>
                    <p className="font-medium text-primary">
                      {resolveLocalized(finding.title, locale)}
                    </p>
                    <p className="text-xs text-secondary">
                      {finding.previousRiskRating ?? '—'} → {finding.riskRating} ·{' '}
                      {finding.previousStatus ?? '—'} → {finding.status}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CHANGE_TONE[finding.change] ?? CHANGE_TONE.unchanged}`}
                  >
                    {t(`changes.${finding.change}`)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-secondary">{t('noDiff')}</p>
          )}
        </section>
      )}

      {snaps.length < 2 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('needTwo')} />
        </section>
      ) : (
        <>
          <form method="GET" data-testid="trend-select" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-secondary">
              {t('metric')}
              <select name="group" defaultValue={group} className={inputCls}>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {t.has(`groups.${g}`) ? t(`groups.${g}`) : g}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-secondary">
              {t('series')}
              <select name="key" defaultValue={key} className={inputCls}>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k}
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

          <section
            className="rounded-xl border border-border bg-white p-5 shadow-sm"
            data-testid="trend-chart"
          >
            <TrendChart points={series} />
            <ul className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-secondary">
              {series.map((p, i) => (
                <li key={i} className="flex flex-col items-center">
                  <span className="font-medium text-foreground">{p.value}</span>
                  <span>{p.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
