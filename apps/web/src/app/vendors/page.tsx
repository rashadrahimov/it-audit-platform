import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createVendorAction, transitionVendorAction } from './actions';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { filterQuery } from '@/lib/filters';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
type VStatus = 'procurement' | 'active' | 'archived';
interface Vendor {
  id: string;
  name: string;
  category: string | null;
  inherentRisk: RiskClass | null;
  residualRisk: RiskClass | null;
  status: VStatus;
  securityOwner: string | null;
}
interface ListItem {
  code: string;
  labelI18n: { en: string; ru?: string; az?: string };
}
interface Analytics {
  total: number;
  byCategory: Record<string, number>;
  byInherentRisk: Record<string, number>;
  byStatus: Record<string, number>;
}
const NEXT: Record<VStatus, VStatus[]> = {
  procurement: ['active', 'archived'],
  active: ['archived'],
  archived: [],
};
const RISK_CLASSES: RiskClass[] = ['low', 'medium', 'high', 'critical'];

const RISK_TONE: Record<RiskClass, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

/** Vendor risk (T-060): реестр вендоров; фильтры T-V16; категории+аналитика T-V13. */
export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; inherentRisk?: string; category?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('vendors'),
    getTranslations('filters'),
    getLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [res, catRes, anRes] = await Promise.all([
    apiFetch(`/vendors?${filterQuery(sp, ['status', 'inherentRisk', 'category']).slice(1)}`, {
      headers,
    }),
    apiFetch('/config-lists/vendor_categories', { headers }),
    apiFetch('/vendors/analytics', { headers }),
  ]);
  const vendors: Vendor[] = res.ok ? await res.json() : [];
  const categories: ListItem[] = catRes.ok ? (await catRes.json()).items : [];
  const analytics: Analytics | null = anRes.ok ? await anRes.json() : null;
  const catLabel = (code: string) => {
    const item = categories.find((c) => c.code === code);
    if (!item) return code;
    return (
      (item.labelI18n as Record<string, string | undefined>)[locale] ?? item.labelI18n.en ?? code
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <FilterBar
        basePath="/vendors"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'status',
            label: tFilters('status'),
            options: (['procurement', 'active', 'archived'] as const).map((s) => ({
              value: s,
              label: t(`status.${s}`),
            })),
          },
          {
            param: 'inherentRisk',
            label: tFilters('risk'),
            options: RISK_CLASSES.map((r) => ({ value: r, label: t(`cls.${r}`) })),
          },
          {
            param: 'category',
            label: t('category'),
            options: categories.map((c) => ({ value: c.code, label: catLabel(c.code) })),
          },
        ]}
      />

      {analytics && analytics.total > 0 && (
        <section
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="vendors-analytics"
        >
          <span className="text-sm font-medium text-secondary">
            {t('analytics')} · {analytics.total}
          </span>
          {Object.entries(analytics.byCategory).map(([code, count]) => (
            <Link
              key={code}
              href={code === 'uncategorized' ? '/vendors' : `/vendors?category=${code}`}
              className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-border"
            >
              {code === 'uncategorized' ? t('uncategorized') : catLabel(code)}{' '}
              <span className="tabular-nums">{count}</span>
            </Link>
          ))}
        </section>
      )}

      <form
        action={createVendorAction}
        data-testid="vendor-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('create')}</span>
          <input
            name="name"
            required
            placeholder={t('namePh')}
            className="rounded-md border border-border px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('risk')}</span>
          <select
            name="inherentRisk"
            defaultValue="medium"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {RISK_CLASSES.map((r) => (
              <option key={r} value={r}>
                {t(`cls.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('category')}</span>
          <select
            name="category"
            defaultValue=""
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {catLabel(c.code)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {vendors.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="vendors-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('risk')}</th>
                <th className="px-4 py-3 font-medium">{t('securityOwner')}</th>
                <th className="px-4 py-3 font-medium">{t('statusLabel')}</th>
                <th className="px-4 py-3 font-medium">{t('lifecycle')}</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/vendors/${v.id}`}
                      className="font-medium text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                    >
                      {v.name}
                    </Link>
                    {v.category && (
                      <span className="ml-2 text-xs text-secondary">{catLabel(v.category)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {v.inherentRisk ? (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RISK_TONE[v.inherentRisk]}`}
                      >
                        {t(`cls.${v.inherentRisk}`)}
                      </span>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary">{v.securityOwner ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                      {t(`status.${v.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {NEXT[v.status].length > 0 && (
                      <form action={transitionVendorAction} className="flex gap-1">
                        <input type="hidden" name="id" value={v.id} />
                        {NEXT[v.status].map((to) => (
                          <button
                            key={to}
                            type="submit"
                            name="to"
                            value={to}
                            className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {t(`status.${to}`)}
                          </button>
                        ))}
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
