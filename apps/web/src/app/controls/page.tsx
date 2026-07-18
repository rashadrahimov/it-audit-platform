import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface ControlRow {
  id: string;
  ref: string;
  domain: { code: string; name: string } | null;
  objective: string;
  standards: Array<{ framework: string; version: string; requirement: string }>;
}

/** Библиотека контролей (T-031): DoD — контроль виден с его стандартами. */
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
  const res = await apiFetch(`/controls?${query}`);
  const controls: ControlRow[] = res.ok ? await res.json() : [];

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
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="controls-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('ref')}</th>
              <th className="px-4 py-3 font-medium">{t('domain')}</th>
              <th className="px-4 py-3 font-medium">{t('objective')}</th>
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
                <td className="px-4 py-3 text-foreground">{c.objective}</td>
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
                <td colSpan={4} className="px-4 py-8 text-center text-secondary">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
