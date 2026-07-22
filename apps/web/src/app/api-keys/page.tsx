import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { revokeApiKeyAction } from './actions';
import { NewKeyForm } from './new-key-form';
import { EmptyState } from '@/components/empty-state';

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

  // T-V37: публичный REST API v1 — все основные ресурсы (read-only, X-Api-Key)
  const API_RESOURCES = [
    'controls',
    'findings',
    'risks',
    'vendors',
    'policies',
    'engagements',
    'assets',
    'tests',
    'vulnerabilities',
    'security-alerts',
    'documents',
  ];
  const API_GROUPS = [
    { key: 'audit', endpoints: ['engagements', 'controls', 'tests', 'documents'] },
    { key: 'risk', endpoints: ['findings', 'risks', 'vulnerabilities', 'security-alerts'] },
    { key: 'thirdParty', endpoints: ['vendors', 'policies', 'assets'] },
  ] as const;
  const API_GUARDS = ['tenantScoped', 'readOnly', 'hashedKeys', 'revoke'] as const;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
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
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
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

      <section className="flex flex-col gap-3" data-testid="api-v1-reference">
        <h2 className="text-sm font-semibold text-secondary">{t('apiTitle')}</h2>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
          <p className="text-xs text-secondary">{t('apiHint')}</p>
          <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
            curl -H &quot;X-Api-Key: &lt;key&gt;&quot; https://&lt;host&gt;/api/v1/findings
          </pre>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-secondary">{t('apiResources')}</span>
            <div className="flex flex-wrap gap-1.5">
              {API_RESOURCES.map((r) => (
                <code
                  key={r}
                  className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-secondary"
                >
                  /api/v1/{r}
                </code>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
        data-testid="api-integration-readiness"
      >
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700 uppercase">
            {t('integration.kicker')}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-primary">{t('integration.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-secondary">{t('integration.subtitle')}</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {API_GROUPS.map((group) => (
            <article key={group.key} className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-primary">
                {t(`integration.groups.${group.key}.title`)}
              </p>
              <p className="mt-1 text-xs text-secondary">
                {t(`integration.groups.${group.key}.hint`)}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {group.endpoints.map((endpoint) => (
                  <code
                    key={endpoint}
                    className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-secondary"
                  >
                    /api/v1/{endpoint}
                  </code>
                ))}
              </div>
            </article>
          ))}
        </div>
        <div className="border-t border-border bg-muted/20 p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-secondary uppercase">
            {t('integration.guardrails')}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {API_GUARDS.map((guard) => (
              <div key={guard} className="rounded-lg bg-white px-3 py-2 text-sm text-foreground">
                <span className="mr-2 text-emerald-600">✓</span>
                {t(`integration.guards.${guard}`)}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
