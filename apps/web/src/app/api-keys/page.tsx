import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { revokeApiKeyAction } from './actions';
import { NewKeyForm } from './new-key-form';

export const dynamic = 'force-dynamic';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

/** API-ключи тенанта (T-090): генерация (plaintext один раз) + отзыв. */
export default async function ApiKeysPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('apiKeys'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/api-keys', { headers });
  const keys: ApiKey[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      <NewKeyForm
        labels={{
          namePh: t('namePh'),
          add: t('add'),
          once: t('once'),
          error: t('error'),
        }}
      />

      {keys.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">{t('empty')}</section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="apikeys-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('name')}</th>
                <th className="px-4 py-3 font-medium">{t('prefix')}</th>
                <th className="px-4 py-3 font-medium">{t('lastUsed')}</th>
                <th className="px-4 py-3 font-medium">{t('status')}</th>
                <th className="px-4 py-3 font-medium">—</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary">{k.prefix}</td>
                  <td className="px-4 py-3 text-secondary">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        k.revoked ? 'bg-muted text-secondary' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {k.revoked ? t('revoked') : t('active')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!k.revoked && (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {t('revoke')}
                        </button>
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
