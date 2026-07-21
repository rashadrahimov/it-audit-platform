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
interface MonitoringSummary {
  generatedAt: string;
  scheduler: {
    connectorAutosyncEveryMinutes: number;
    autoTestRunEveryMinutes: number;
  };
  counts: {
    connectors: number;
    activeConnectors: number;
    scheduledConnectors: number;
    dueForSync: number;
    errorConnectors: number;
    automatedTests: number;
    failingAutomatedTests: number;
  };
  lastSyncAt: string | null;
  lastAutoTestAt: string | null;
  connectors: Array<{
    id: string;
    provider: string;
    status: string;
    capabilities: string[];
    syncIntervalMinutes: number | null;
    lastSyncAt: string | null;
    lastOutcome: string | null;
    lastError: string | null;
    dueForSync: boolean;
  }>;
  recentRuns: Array<{
    id: string;
    connectorId: string;
    startedAt: string;
    finishedAt: string | null;
    outcome: string;
    stats: unknown;
    error: string | null;
  }>;
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
  let monitoring: MonitoringSummary | null = null;
  if (tenantSlug) {
    const headers = { 'X-Tenant-Slug': tenantSlug };
    const [catRes, listRes, monitoringRes] = await Promise.all([
      apiFetch('/connectors/catalog', { headers }),
      apiFetch('/connectors', { headers }),
      apiFetch('/connectors/monitoring-summary', { headers }),
    ]);
    catalog = catRes.ok ? await catRes.json() : [];
    raw = listRes.ok ? await listRes.json() : [];
    monitoring = monitoringRes.ok ? await monitoringRes.json() : null;
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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <p className="text-sm text-secondary">{t('subtitle')}</p>

      {monitoring && (
        <section
          className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white shadow-xl shadow-emerald-950/15"
          data-testid="connector-monitoring-summary"
        >
          <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.28em] text-emerald-200 uppercase">
                  {t('monitor.kicker')}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{t('monitor.title')}</h2>
                <p className="mt-1 max-w-2xl text-sm text-emerald-50/75">
                  {t('monitor.subtitle', {
                    sync: monitoring.scheduler.connectorAutosyncEveryMinutes,
                    tests: monitoring.scheduler.autoTestRunEveryMinutes,
                  })}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  [
                    ['activeConnectors', monitoring.counts.activeConnectors],
                    ['scheduledConnectors', monitoring.counts.scheduledConnectors],
                    ['dueForSync', monitoring.counts.dueForSync],
                    ['automatedTests', monitoring.counts.automatedTests],
                  ] as const
                ).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-white/10 bg-white/10 p-3 shadow-inner shadow-white/5"
                  >
                    <dt className="text-[11px] font-medium text-emerald-50/70">
                      {t(`monitor.metrics.${key}`)}
                    </dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={`rounded-full px-3 py-1 font-semibold ${
                    monitoring.counts.errorConnectors > 0
                      ? 'bg-red-400/15 text-red-100 ring-1 ring-red-300/30'
                      : 'bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-200/25'
                  }`}
                >
                  {monitoring.counts.errorConnectors > 0
                    ? t('monitor.errors', { n: monitoring.counts.errorConnectors })
                    : t('monitor.noErrors')}
                </span>
                <span
                  className={`rounded-full px-3 py-1 font-semibold ${
                    monitoring.counts.failingAutomatedTests > 0
                      ? 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-200/30'
                      : 'bg-white/10 text-emerald-50 ring-1 ring-white/10'
                  }`}
                >
                  {t('monitor.failingTests', { n: monitoring.counts.failingAutomatedTests })}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <h3 className="text-sm font-semibold text-emerald-50">{t('monitor.timeline')}</h3>
              <dl className="mt-3 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-emerald-50/65">{t('monitor.lastSync')}</dt>
                  <dd className="font-medium">
                    {monitoring.lastSyncAt
                      ? dateFmt.format(new Date(monitoring.lastSyncAt))
                      : t('never')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-emerald-50/65">{t('monitor.lastAutoTest')}</dt>
                  <dd className="font-medium">
                    {monitoring.lastAutoTestAt
                      ? dateFmt.format(new Date(monitoring.lastAutoTestAt))
                      : t('never')}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 space-y-2">
                {monitoring.connectors.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/30 px-3 py-2 text-xs"
                  >
                    <span className="font-medium">
                      {byProvider.get(c.provider)?.label ?? c.provider}
                    </span>
                    <span
                      className={
                        c.dueForSync
                          ? 'text-amber-100'
                          : c.lastOutcome === 'error'
                            ? 'text-red-100'
                            : 'text-emerald-100'
                      }
                    >
                      {c.dueForSync
                        ? t('monitor.dueNow')
                        : c.lastOutcome
                          ? t(`monitor.outcomes.${c.lastOutcome}`)
                          : t('monitor.waiting')}
                    </span>
                  </div>
                ))}
                {monitoring.connectors.length === 0 && (
                  <p className="text-xs text-emerald-50/65">{t('monitor.noSources')}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

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
