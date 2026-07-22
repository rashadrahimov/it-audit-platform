import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface ChainStatus {
  valid: boolean;
  checked: number;
  brokenAt?: string;
  reason?: string;
}

interface AuditEvent {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorIp: string | null;
  hasBefore: boolean;
  hasAfter: boolean;
  prevHashPresent: boolean;
  hashPresent: boolean;
}

function localeTag(locale: string): string {
  if (locale === 'ru') return 'ru-RU';
  if (locale === 'az') return 'az-AZ';
  return 'en-US';
}

/** LOG-02/T-104: tenant audit trail explorer with tamper-evident hash-chain status. */
export default async function AuditLogPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, locale] = await Promise.all([
    getTranslations('auditLog'),
    getActiveTenantSlug(),
    getCurrentLocale(),
  ]);
  if (!tenantSlug) redirect('/account');

  const headers = { 'X-Tenant-Slug': tenantSlug };
  const [chainRes, eventsRes] = await Promise.all([
    apiFetch('/audit/verify-chain', { headers }),
    apiFetch('/audit/recent?limit=50', { headers }),
  ]);
  const chain: ChainStatus | null = chainRes.ok ? await chainRes.json() : null;
  const events: AuditEvent[] = eventsRes.ok ? await eventsRes.json() : [];
  const dateLocale = localeTag(locale);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6 pt-12">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-700 uppercase">
            {t('kicker')}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-primary">{t('title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-secondary">{t('subtitle')}</p>
        </div>
        <code className="rounded-xl border border-border bg-white px-3 py-2 text-xs text-secondary shadow-sm">
          /audit/syslog?limit=200
        </code>
      </div>

      <section className="grid gap-4 md:grid-cols-3" data-testid="audit-log-traceability">
        <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary">{t('integrityTitle')}</p>
              <p className="mt-1 text-sm text-secondary">{t('integrityBody')}</p>
            </div>
            <span
              className={
                'rounded-full px-3 py-1 text-xs font-semibold ' +
                (chain?.valid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')
              }
              data-testid="audit-log-chain-status"
            >
              {chain?.valid ? t('valid') : t('needsReview')}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-2xl font-bold text-primary">{chain?.checked ?? '—'}</p>
              <p className="text-xs text-secondary">{t('checkedEvents')}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-2xl font-bold text-primary">
                {events.filter((event) => event.hashPresent).length}
              </p>
              <p className="text-xs text-secondary">{t('hashedEvents')}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-2xl font-bold text-primary">{events.length}</p>
              <p className="text-xs text-secondary">{t('visibleEvents')}</p>
            </div>
          </div>
          {chain && !chain.valid && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-white p-3 text-sm text-rose-700">
              {t('broken', {
                id: chain.brokenAt ?? '—',
                reason: chain.reason ?? 'unknown',
              })}
            </p>
          )}
        </article>

        <article className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-primary">{t('privacyTitle')}</p>
          <p className="mt-2 text-sm text-secondary">{t('privacyBody')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-secondary">
              {t('noPayload')}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-secondary">
              {t('tenantScoped')}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-secondary">
              {t('syslogReady')}
            </span>
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold text-primary">{t('eventsTitle')}</h2>
          <p className="mt-1 text-sm text-secondary">{t('eventsSubtitle')}</p>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-sm text-secondary">{t('empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="audit-log-events-table">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-secondary uppercase">
                  <th className="px-4 py-3 font-medium">{t('time')}</th>
                  <th className="px-4 py-3 font-medium">{t('actor')}</th>
                  <th className="px-4 py-3 font-medium">{t('action')}</th>
                  <th className="px-4 py-3 font-medium">{t('entity')}</th>
                  <th className="px-4 py-3 font-medium">{t('evidence')}</th>
                  <th className="px-4 py-3 font-medium">{t('hash')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-secondary">
                      {new Date(event.at).toLocaleString(dateLocale)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {event.actorName ?? t('systemActor')}
                      </p>
                      <p className="text-xs text-secondary">
                        {event.actorEmail ?? event.actorIp ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-primary">{event.action}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{event.entityType}</p>
                      <p className="font-mono text-xs text-secondary">{event.entityId ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {event.hasBefore || event.hasAfter ? t('payloadRedacted') : t('metadataOnly')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                          (event.hashPresent
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700')
                        }
                      >
                        {event.hashPresent ? t('hashOk') : t('legacy')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
