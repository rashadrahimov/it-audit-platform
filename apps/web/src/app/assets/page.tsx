import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { filterQuery } from '@/lib/filters';
import { bulkTagAssetsAction, createAssetAction } from './actions';

export const dynamic = 'force-dynamic';

const TYPES = ['erp', 'db', 'network', 'app', 'cloud', 'endpoint', 'other'] as const;

interface AssetRow {
  id: string;
  name: string;
  type: string;
  owner: string | null;
  fromConnector: boolean;
  provider: string | null;
  tags: Array<{ name: string; color: string | null }>;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Реестр ИТ-активов (T-V11): таблица + создание + bulk-теги + CSV-экспорт. */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('assets'),
    getTranslations('filters'),
    getLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [res, membersRes] = await Promise.all([
    apiFetch(`/assets?${filterQuery(sp, ['type']).slice(1)}`, { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
  ]);
  const assets: AssetRow[] = res.ok ? await res.json() : [];
  const members: Array<{ id: string; fullName: string }> = membersRes.ok
    ? await membersRes.json()
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <a
          href="/assets/export"
          data-testid="assets-export"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('exportCsv')}
        </a>
      </div>

      <FilterBar
        basePath="/assets"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'type',
            label: t('type'),
            options: TYPES.map((ty) => ({ value: ty, label: t(`ty.${ty}`) })),
          },
        ]}
      />

      <form
        action={createAssetAction}
        data-testid="asset-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('create')}</span>
          <input name="name" required placeholder={t('namePh')} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('type')}</span>
          <select name="type" defaultValue="app" className={inputCls}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`ty.${ty}`)}
              </option>
            ))}
          </select>
        </label>
        {members.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('owner')}</span>
            <select name="ownerMembershipId" defaultValue="" className={inputCls}>
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {assets.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <form action={bulkTagAssetsAction} className="flex flex-col gap-3">
          <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-left text-sm" data-testid="assets-table">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3 font-medium">{t('name')}</th>
                  <th className="px-4 py-3 font-medium">{t('type')}</th>
                  <th className="px-4 py-3 font-medium">{t('owner')}</th>
                  <th className="px-4 py-3 font-medium">{t('source')}</th>
                  <th className="px-4 py-3 font-medium">{t('tags')}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        name="assetId"
                        value={a.id}
                        aria-label={a.name}
                        className="size-4 accent-[var(--color-accent)]"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-3 text-secondary">{t(`ty.${a.type}`)}</td>
                    <td className="px-4 py-3 text-secondary">{a.owner ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                        {a.fromConnector ? (a.provider ?? t('connector')) : t('manual')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.tags.length === 0 ? (
                        <span className="text-secondary">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {a.tags.map((tg) => (
                            <span
                              key={tg.name}
                              className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
                            >
                              {tg.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
            data-testid="bulk-tag"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('bulkTag')}</span>
              <input name="tagName" required placeholder={t('tagPh')} className={inputCls} />
            </label>
            <button
              type="submit"
              data-testid="bulk-tag-submit"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('applyTag')}
            </button>
            <p className="text-xs text-secondary">{t('bulkHint')}</p>
          </div>
        </form>
      )}
    </main>
  );
}
