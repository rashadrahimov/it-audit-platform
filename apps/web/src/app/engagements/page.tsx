import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { NewEngagementForm } from './new-engagement-form';

export const dynamic = 'force-dynamic';

interface EngagementRow {
  id: string;
  title: string;
  mode: string;
  state: string;
  subsidiary: string;
  auditType: string | null;
}
interface Subsidiary {
  id: string;
  name: string;
}
interface AuditType {
  code: string;
  name: string;
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
  let subsidiaries: Subsidiary[] = [];
  let auditTypes: AuditType[] = [];
  if (tenantSlug) {
    const headers = { 'X-Tenant-Slug': tenantSlug };
    const [eRes, sRes, aRes] = await Promise.all([
      apiFetch(`/engagements?locale=${locale}${archived ? '&archived=true' : ''}`, { headers }),
      apiFetch(`/subsidiaries?locale=${locale}`, { headers }),
      apiFetch(`/audit-types?locale=${locale}`, { headers }),
    ]);
    engagements = eRes.ok ? await eRes.json() : [];
    subsidiaries = sRes.ok ? await sRes.json() : [];
    auditTypes = aRes.ok ? await aRes.json() : [];
  }

  const tabCls = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
      on ? 'bg-accent text-on-primary' : 'text-secondary hover:bg-muted'
    }`;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <nav data-testid="engagements-view-toggle" className="flex gap-1">
        <Link href="/engagements" className={tabCls(!archived)}>
          {t('viewActive')}
        </Link>
        <Link href="/engagements?archived=true" className={tabCls(archived)}>
          {t('viewArchived')}
        </Link>
      </nav>
      {!archived && (
        <NewEngagementForm
          subsidiaries={subsidiaries}
          auditTypes={auditTypes}
          labels={{
            create: t('createTitle'),
            title: t('name'),
            titlePh: t('titlePh'),
            subsidiary: t('subsidiary'),
            auditType: t('auditType'),
            none: t('none'),
            mode: t('mode'),
            formal: t('modes.formal'),
            light: t('modes.light'),
            periodStart: t('periodStart'),
            periodEnd: t('periodEnd'),
            submit: t('createSubmit'),
            error: t('createError'),
          }}
        />
      )}
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
                <td colSpan={5} className="p-0">
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
