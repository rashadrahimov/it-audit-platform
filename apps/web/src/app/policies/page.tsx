import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface Policy {
  id: string;
  title: string;
  status: string;
  owner: string | null;
  renewBy: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-secondary',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  archived: 'bg-muted text-secondary',
};

/** Политики (T-051–T-053, EP-POL): список со статусами workflow. */
export default async function PoliciesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('policies'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  let policies: Policy[] = [];
  if (tenantSlug) {
    const res = await apiFetch(`/policies?locale=${locale}`, {
      headers: { 'X-Tenant-Slug': tenantSlug },
    });
    policies = res.ok ? await res.json() : [];
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="policies-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('owner')}</th>
              <th className="px-4 py-3 font-medium">{t('renewBy')}</th>
              <th className="px-4 py-3 font-medium">{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{p.title}</td>
                <td className="px-4 py-3 text-secondary">{p.owner ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-secondary">
                  {p.renewBy ? dateFmt.format(new Date(p.renewBy)) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ' +
                      (STATUS_CLASS[p.status] ?? 'bg-muted text-secondary')
                    }
                  >
                    {t(`statuses.${p.status}`)}
                  </span>
                </td>
              </tr>
            ))}
            {policies.length === 0 && (
              <tr>
                <td colSpan={4} className="p-0">
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
