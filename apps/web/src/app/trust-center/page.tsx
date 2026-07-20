import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { decideTrustAccessAction } from './actions';

export const dynamic = 'force-dynamic';

interface TrustItem {
  id: string;
  label: string;
  category: string;
  published: boolean;
}
interface TrustCenter {
  slug: string;
  title: string;
  intro: string | null;
  isPublic: boolean;
  items: TrustItem[];
}
interface AccessRequest {
  id: string;
  email: string;
  company: string | null;
  status: string;
  token: string | null;
}
interface Activity {
  kind: string;
  detail: string | null;
  at: string;
}

const REQ_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-muted text-secondary',
};

/** Trust Center admin (T-080/081, T-V30): постура + запросы доступа + activity-лента. */
export default async function TrustCenterPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('trustCenter'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/trust-center', { headers });
  const tc: TrustCenter | null = res.ok ? await res.json() : null;

  let requests: AccessRequest[] = [];
  let activity: Activity[] = [];
  if (tc) {
    const [rRes, aRes] = await Promise.all([
      apiFetch('/trust-center/access-requests', { headers }),
      apiFetch('/trust-center/activity', { headers }),
    ]);
    if (rRes.ok) requests = await rRes.json();
    if (aRes.ok) activity = await aRes.json();
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {tc === null ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('notConfigured')} />
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{tc.title}</h2>
                {tc.intro && <p className="mt-1 text-sm text-secondary">{tc.intro}</p>}
                <p className="mt-2 text-xs text-secondary">
                  {t('slug')}:{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5">/trust/{tc.slug}</code>
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                  tc.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-secondary'
                }`}
              >
                {tc.isPublic ? t('public') : t('private')}
              </span>
            </div>
            <p className="mt-4 text-sm text-secondary">
              <span className="font-medium text-foreground">{requests.length}</span>{' '}
              {t('accessRequests')}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-secondary">{t('items')}</h3>
            <ul
              className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
              data-testid="trust-items"
            >
              {tc.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-secondary">
                      {item.category}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium ${item.published ? 'text-emerald-700' : 'text-secondary'}`}
                  >
                    {item.published ? t('published') : t('draft')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section data-testid="trust-requests">
            <h3 className="mb-3 text-sm font-semibold text-secondary">{t('requestsTitle')}</h3>
            {requests.length === 0 ? (
              <EmptyState size="sm" text={t('accessRequests')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {requests.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-4 py-3 shadow-sm"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{r.email}</span>
                      {r.company && <span className="text-xs text-secondary">{r.company}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${REQ_TONE[r.status] ?? 'bg-muted text-secondary'}`}
                      >
                        {r.status}
                      </span>
                      {r.status === 'pending' && (
                        <>
                          <form action={decideTrustAccessAction.bind(null, r.id, 'approved')}>
                            <button
                              type="submit"
                              data-testid={`trust-approve-${r.id}`}
                              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-emerald-700 transition-colors duration-150 hover:bg-muted"
                            >
                              {t('approve')}
                            </button>
                          </form>
                          <form action={decideTrustAccessAction.bind(null, r.id, 'denied')}>
                            <button
                              type="submit"
                              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                            >
                              {t('deny')}
                            </button>
                          </form>
                        </>
                      )}
                    </span>
                    {r.status === 'approved' && r.token && tc.isPublic && (
                      <span className="w-full">
                        <p className="text-xs text-secondary">{t('copyHint')}</p>
                        <code className="mt-0.5 block truncate rounded bg-muted px-2 py-1 text-xs text-foreground">
                          /trust/{tc.slug}?token={r.token}
                        </code>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section data-testid="trust-activity">
            <h3 className="mb-3 text-sm font-semibold text-secondary">{t('activity')}</h3>
            {activity.length === 0 ? (
              <EmptyState size="sm" text={t('noActivity')} />
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                {activity.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{t(`kind.${a.kind}`)}</span>
                      {a.detail && <span className="text-xs text-secondary">{a.detail}</span>}
                    </span>
                    <span className="text-xs whitespace-nowrap text-secondary tabular-nums">
                      {dateFmt.format(new Date(a.at))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
