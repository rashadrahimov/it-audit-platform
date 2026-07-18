import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { syncConnectorAction } from './actions';

export const dynamic = 'force-dynamic';

interface Connector {
  id: string;
  provider: string;
  capabilities: string[];
  status: string;
  hasConfig: boolean;
  lastSyncAt: string | null;
}

/** Коннекторы (T-048–T-050, EP-INT): список, ручной sync, статус. */
export default async function ConnectorsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('connectors'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  let connectors: Connector[] = [];
  if (tenantSlug) {
    const res = await apiFetch('/connectors', { headers: { 'X-Tenant-Slug': tenantSlug } });
    connectors = res.ok ? await res.json() : [];
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

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
      <p className="text-sm text-secondary">{t('subtitle')}</p>

      <section className="flex flex-col gap-3" data-testid="connectors-list">
        {connectors.length === 0 && <p className="text-sm text-secondary">{t('empty')}</p>}
        {connectors.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground uppercase">{c.provider}</span>
                <span
                  className={
                    'rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                    (c.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : c.status === 'error'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-muted text-secondary')
                  }
                >
                  {t(`statuses.${c.status}`)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-secondary"
                  >
                    {cap}
                  </span>
                ))}
              </div>
              <span className="text-xs text-secondary">
                {t('lastSync')}: {c.lastSyncAt ? dateFmt.format(new Date(c.lastSyncAt)) : '—'}
              </span>
            </div>
            <form action={syncConnectorAction.bind(null, c.id)}>
              <button
                type="submit"
                data-testid={`sync-${c.id}`}
                className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('sync')}
              </button>
            </form>
          </div>
        ))}
      </section>
    </main>
  );
}
