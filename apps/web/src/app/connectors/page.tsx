import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { AddConnector, ConnectorCard } from './connectors-client';
import type { CatalogEntry, Connector } from './connectors-client';

export const dynamic = 'force-dynamic';

interface RawConnector {
  id: string;
  provider: string;
  capabilities: string[];
  status: string;
  hasConfig: boolean;
  syncIntervalMinutes: number | null;
  lastSyncAt: string | null;
}

/** Коннекторы (T-048–T-050, T-V38): каталог провайдеров, добавление, sync, тест, расписание. */
export default async function ConnectorsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('connectors'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  let catalog: CatalogEntry[] = [];
  let raw: RawConnector[] = [];
  if (tenantSlug) {
    const headers = { 'X-Tenant-Slug': tenantSlug };
    const [catRes, listRes] = await Promise.all([
      apiFetch('/connectors/catalog', { headers }),
      apiFetch('/connectors', { headers }),
    ]);
    catalog = catRes.ok ? await catRes.json() : [];
    raw = listRes.ok ? await listRes.json() : [];
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const byProvider = new Map(catalog.map((c) => [c.provider, c]));
  const connectors: Connector[] = raw.map((c) => ({
    id: c.id,
    provider: c.provider,
    capabilities: c.capabilities,
    status: c.status,
    hasConfig: c.hasConfig,
    syncIntervalMinutes: c.syncIntervalMinutes,
    lastSyncText: c.lastSyncAt ? dateFmt.format(new Date(c.lastSyncAt)) : '—',
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <p className="text-sm text-secondary">{t('subtitle')}</p>

      <AddConnector catalog={catalog} />

      <section className="flex flex-col gap-3" data-testid="connectors-list">
        <h2 className="text-sm font-semibold text-secondary">{t('listTitle')}</h2>
        {connectors.length === 0 && <p className="text-sm text-secondary">{t('empty')}</p>}
        {connectors.map((c) => (
          <ConnectorCard key={c.id} connector={c} entry={byProvider.get(c.provider)} />
        ))}
      </section>
    </main>
  );
}
