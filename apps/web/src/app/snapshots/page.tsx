import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface SnapshotRow {
  id: string;
  label: string;
  capturedAt: string;
}
type Metrics = Record<string, Record<string, number>>;
interface SnapshotDetail extends SnapshotRow {
  metrics: Metrics;
}

const sumMetric = (metrics: Metrics, name: string): number =>
  Object.values(metrics[name] ?? {}).reduce((acc, v) => acc + v, 0);

/** Снапшоты (T-073): замороженные метрики на дату — доказуемость «как было». */
export default async function SnapshotsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('snapshots'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/snapshots', { headers });
  const list: SnapshotRow[] = res.ok ? await res.json() : [];
  const snapshots = await Promise.all(
    list.map(async (s) => {
      const dRes = await apiFetch(`/snapshots/${s.id}`, { headers });
      return (dRes.ok ? await dRes.json() : null) as SnapshotDetail | null;
    }),
  );

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {list.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="snapshots">
          {snapshots.filter(Boolean).map((s) => (
            <li key={s!.id} className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-foreground">{s!.label}</span>
                <span className="text-sm text-secondary">
                  {t('capturedAt')}: {dateFmt.format(new Date(s!.capturedAt))}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                {(
                  [
                    ['controls', sumMetric(s!.metrics, 'controls_total')],
                    ['risks', sumMetric(s!.metrics, 'risks_by_class')],
                    ['findings', sumMetric(s!.metrics, 'findings_by_status')],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-muted/50 py-3">
                    <dd className="text-xl font-bold tabular-nums text-foreground">{value}</dd>
                    <dt className="text-xs text-secondary">{t(key)}</dt>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
