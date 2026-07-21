import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface ControlRow {
  id: string;
  ref: string;
  domain: { code: string; name: string } | null;
  objective: string;
  status: string;
  owner: string | null;
  testCount: number;
  passingCount: number;
  standards: Array<{ framework: string; version: string; requirement: string }>;
}
interface Summary {
  total: number;
  assigned: number;
  unassigned: number;
  withPassingEvidence: number;
  percentPassing: number;
}

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-amber-100 text-amber-700',
  retired: 'bg-muted text-secondary',
};

/** Библиотека контролей (T-031 → T-V45): стандарты + owner/тесты + сводка. */
export default async function ControlsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('controls'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  const query = new URLSearchParams({ locale });
  if (tenantSlug) query.set('tenantSlug', tenantSlug);
  const [res, sumRes] = await Promise.all([
    apiFetch(`/controls?${query}`),
    tenantSlug
      ? apiFetch(`/controls/summary?locale=${locale}`, { headers: { 'X-Tenant-Slug': tenantSlug } })
      : Promise.resolve(null),
  ]);
  const controls: ControlRow[] = res.ok ? await res.json() : [];
  const summary: Summary | null = sumRes && sumRes.ok ? await sumRes.json() : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {summary && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="controls-summary">
          {(
            [
              ['assigned', summary.assigned, 'text-emerald-700'],
              ['unassigned', summary.unassigned, 'text-amber-700'],
              ['withPassing', summary.withPassingEvidence, 'text-emerald-700'],
              ['percentPassing', `${summary.percentPassing}%`, 'text-primary'],
            ] as const
          ).map(([key, value, tone]) => (
            <div key={key} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
              <div className="text-xs font-medium text-secondary">{t(key)}</div>
            </div>
          ))}
        </section>
      )}

      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="controls-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('ref')}</th>
              <th className="px-4 py-3 font-medium">{t('domain')}</th>
              <th className="px-4 py-3 font-medium">{t('owner')}</th>
              <th className="px-4 py-3 font-medium">{t('tests')}</th>
              <th className="px-4 py-3 font-medium">{t('statusCol')}</th>
              <th className="px-4 py-3 font-medium">{t('standards')}</th>
            </tr>
          </thead>
          <tbody>
            {controls.map((c) => (
              <tr key={c.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  <Link
                    href={`/controls/${c.id}`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {c.ref}
                  </Link>
                </td>
                <td className="px-4 py-3 text-secondary">{c.domain?.name ?? '—'}</td>
                <td className="px-4 py-3 text-secondary">{c.owner ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-secondary tabular-nums">
                  {c.testCount === 0 ? (
                    '—'
                  ) : (
                    <span className={c.passingCount === c.testCount ? 'text-emerald-700' : ''}>
                      {c.passingCount}/{c.testCount}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[c.status] ?? 'bg-muted text-secondary'}`}
                  >
                    {t(`st.${c.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.standards.length === 0 ? (
                    <span className="text-secondary">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {c.standards.map((s) => (
                        <span
                          key={`${s.framework}-${s.requirement}`}
                          className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-secondary"
                        >
                          {s.framework} {s.requirement}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {controls.length === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
