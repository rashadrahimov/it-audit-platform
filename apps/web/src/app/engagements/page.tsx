import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface EngagementRow {
  id: string;
  title: string;
  mode: string;
  state: string;
  subsidiary: string;
  auditType: string | null;
}

/** Список engagement'ов (T-035; ENG-08: переключатель Активные/Архив). */
export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tStates, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('engagements'),
    getTranslations('engagementStates'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const archived = sp.archived === 'true';

  let engagements: EngagementRow[] = [];
  if (tenantSlug) {
    const res = await apiFetch(`/engagements?locale=${locale}${archived ? '&archived=true' : ''}`, {
      headers: { 'X-Tenant-Slug': tenantSlug },
    });
    engagements = res.ok ? await res.json() : [];
  }

  const tabCls = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
      on ? 'bg-accent text-on-primary' : 'text-secondary hover:bg-muted'
    }`;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>
      <nav data-testid="engagements-view-toggle" className="flex gap-1">
        <Link href="/engagements" className={tabCls(!archived)}>
          {t('viewActive')}
        </Link>
        <Link href="/engagements?archived=true" className={tabCls(archived)}>
          {t('viewArchived')}
        </Link>
      </nav>
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="engagements-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('subsidiary')}</th>
              <th className="px-4 py-3 font-medium">{t('auditType')}</th>
              <th className="px-4 py-3 font-medium">{t('mode')}</th>
              <th className="px-4 py-3 font-medium">{t('state')}</th>
            </tr>
          </thead>
          <tbody>
            {engagements.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/engagements/${e.id}`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {e.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-secondary">{e.subsidiary}</td>
                <td className="px-4 py-3 text-secondary">{e.auditType ?? '—'}</td>
                <td className="px-4 py-3 text-secondary">{t(`modes.${e.mode}`)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-secondary">
                    {tStates(e.state)}
                  </span>
                </td>
              </tr>
            ))}
            {engagements.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-secondary">
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
