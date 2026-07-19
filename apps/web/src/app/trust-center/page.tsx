import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

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

/** Trust Center admin (T-080/081): постура + published-items + запросы доступа. */
export default async function TrustCenterPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('trustCenter'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/trust-center', { headers });
  const tc: TrustCenter | null = res.ok ? await res.json() : null;

  let requestCount = 0;
  if (tc) {
    const rRes = await apiFetch('/trust-center/access-requests', { headers });
    if (rRes.ok) requestCount = ((await rRes.json()) as unknown[]).length;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {tc === null ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('notConfigured')}
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
              <span className="font-medium text-foreground">{requestCount}</span>{' '}
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
        </>
      )}
    </main>
  );
}
