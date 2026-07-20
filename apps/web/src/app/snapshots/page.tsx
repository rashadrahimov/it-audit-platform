import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocalized, type I18nText } from '@it-audit/shared';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { createSnapshotAction } from './actions';

export const dynamic = 'force-dynamic';

interface SnapshotRow {
  id: string;
  label: string;
  capturedAt: string;
}
type Metrics = Record<string, Record<string, number>>;
interface FrozenFinding {
  id: string;
  title: I18nText;
  riskRating: string;
  status: string;
  slaStatus: string;
  dueDate: string | null;
  owner: string | null;
}
interface FrozenVuln {
  id: string;
  title: string;
  severity: string;
  status: string;
  slaStatus: string;
}
interface Composition {
  findings?: FrozenFinding[];
  vulnerabilities?: FrozenVuln[];
}
interface SnapshotDetail extends SnapshotRow {
  metrics: Metrics;
  composition: Composition;
}

const sumMetric = (metrics: Metrics, name: string): number =>
  Object.values(metrics[name] ?? {}).reduce((acc, v) => acc + v, 0);

const RISK_TONE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-muted text-secondary',
};

/** Снапшоты (T-073, T-V34): метрики + замороженный состав открытых findings на дату. */
export default async function SnapshotsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFindings, locale, tenantSlug] = await Promise.all([
    getTranslations('snapshots'),
    getTranslations('findings'),
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
  const dueFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form
        action={createSnapshotAction}
        data-testid="snapshot-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('create')}</span>
          <input
            name="label"
            required
            placeholder={t('labelPh')}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <button
          type="submit"
          data-testid="snapshot-create-btn"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('createBtn')}
        </button>
      </form>

      {list.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="snapshots">
          {snapshots.filter(Boolean).map((s) => {
            const openFindings = s!.composition?.findings ?? [];
            const openVulns = s!.composition?.vulnerabilities ?? [];
            return (
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

                <details className="mt-4" data-testid={`snapshot-composition-${s!.id}`}>
                  <summary className="cursor-pointer text-sm font-medium text-accent">
                    {t('viewComposition')} · {t('count', { n: openFindings.length })}
                  </summary>
                  <div className="mt-3">
                    <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-secondary uppercase">
                      {t('composition')}
                    </h3>
                    {openFindings.length === 0 ? (
                      <p className="text-sm text-secondary">{t('noOpen')}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-border text-secondary">
                              <th className="py-2 pr-4 font-medium">{t('colTitle')}</th>
                              <th className="py-2 pr-4 font-medium">{t('colRisk')}</th>
                              <th className="py-2 pr-4 font-medium">{t('colStatus')}</th>
                              <th className="py-2 font-medium">{t('colDue')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {openFindings.map((f) => (
                              <tr key={f.id} className="border-b border-border last:border-0">
                                <td className="py-2 pr-4 text-foreground">
                                  {resolveLocalized(f.title, locale)}
                                </td>
                                <td className="py-2 pr-4">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RISK_TONE[f.riskRating] ?? 'bg-muted text-secondary'}`}
                                  >
                                    {tFindings(`ratings.${f.riskRating}`)}
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-secondary">
                                  {tFindings(`statuses.${f.status}`)}
                                </td>
                                <td className="py-2 whitespace-nowrap text-secondary">
                                  {f.dueDate ? dueFmt.format(new Date(f.dueDate)) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {openVulns.length > 0 && (
                      <p className="mt-3 text-xs text-secondary">
                        {t('openVulns')}: <span className="font-medium">{openVulns.length}</span>
                      </p>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
