import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { createPolicyFromTemplateAction } from './actions';
import { FilterBar } from '@/components/filter-bar';
import { filterQuery } from '@/lib/filters';

export const dynamic = 'force-dynamic';

interface Policy {
  id: string;
  title: string;
  status: string;
  owner: string | null;
  approver: string | null;
  renewBy: string | null;
  expired: boolean;
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-secondary',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  archived: 'bg-muted text-secondary',
};

/** Политики (T-051–T-053, EP-POL): список со статусами workflow; фильтр T-V16. */
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; needsMyApproval?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('policies'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);

  let policies: Policy[] = [];
  let templates: Array<{ key: string; title: string; preview: string }> = [];
  if (tenantSlug) {
    const [res, tplRes] = await Promise.all([
      apiFetch(`/policies?locale=${locale}${filterQuery(sp, ['status', 'needsMyApproval'])}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
      apiFetch(`/policies/templates?locale=${locale}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
    ]);
    policies = res.ok ? await res.json() : [];
    templates = tplRes.ok ? await tplRes.json() : [];
  }
  const existingTitles = new Set(policies.map((p) => p.title));
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <FilterBar
        basePath="/policies"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'needsMyApproval',
            label: tFilters('scope'),
            options: [{ value: 'true', label: tFilters('needsMyApproval') }],
          },
          {
            param: 'status',
            label: tFilters('status'),
            options: (['draft', 'in_review', 'approved', 'archived'] as const).map((s) => ({
              value: s,
              label: t(`statuses.${s}`),
            })),
          },
        ]}
      />
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="policies-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('owner')}</th>
              <th className="px-4 py-3 font-medium">{t('approver')}</th>
              <th className="px-4 py-3 font-medium">{t('renewBy')}</th>
              <th className="px-4 py-3 font-medium">{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/policies/${p.id}`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {p.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-secondary">{p.owner ?? '—'}</td>
                <td className="px-4 py-3 text-secondary">{p.approver ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-secondary">
                  {p.renewBy ? dateFmt.format(new Date(p.renewBy)) : '—'}
                  {p.expired && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {t('expired')}
                    </span>
                  )}
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
                <td colSpan={5} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {templates.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="policy-templates"
        >
          <h2 className="text-sm font-semibold text-primary">{t('templates')}</h2>
          <p className="text-xs text-secondary">{t('templatesHint')}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((tpl) => (
              <li
                key={tpl.key}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2"
              >
                <span className="text-sm font-medium text-foreground">{tpl.title}</span>
                {existingTitles.has(tpl.title) ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
                    {t('tplCreated')}
                  </span>
                ) : (
                  <form action={createPolicyFromTemplateAction.bind(null, tpl.key)}>
                    <button
                      type="submit"
                      data-testid="template-create"
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('useTemplate')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
