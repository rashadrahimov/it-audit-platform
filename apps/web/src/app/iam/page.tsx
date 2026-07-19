import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { deactivateAccountAction, decideAccessRequestAction } from './actions';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface Account {
  id: string;
  identifier: string;
  displayName: string | null;
  type: 'human' | 'service';
  mfaEnabled: boolean | null;
  status: 'active' | 'deactivated';
  fromConnector: boolean;
}
interface AccessRequest {
  id: string;
  system: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

const btnCls =
  'rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** IAM — accounts (T-054) + access requests (T-056): деактивация, approve/reject. */
export default async function IamPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('iam'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [accRes, reqRes] = await Promise.all([
    apiFetch('/accounts', { headers }),
    apiFetch('/access-requests', { headers }),
  ]);
  const accounts: Account[] = accRes.ok ? await accRes.json() : [];
  const requests: AccessRequest[] = reqRes.ok ? await reqRes.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* Accounts */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('accounts')}</h2>
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('empty')} />
          </div>
        ) : (
          <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-left text-sm" data-testid="accounts-table">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="px-4 py-3 font-medium">{t('identifier')}</th>
                  <th className="px-4 py-3 font-medium">{t('type')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfa')}</th>
                  <th className="px-4 py-3 font-medium">—</th>
                  <th className="px-4 py-3 font-medium">—</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{a.identifier}</span>
                      {a.displayName && (
                        <span className="ml-2 text-xs text-secondary">{a.displayName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary">{t(`tp.${a.type}`)}</td>
                    <td className="px-4 py-3 text-secondary">
                      {a.mfaEnabled === null ? '—' : a.mfaEnabled ? '✓' : '✕'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          a.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-muted text-secondary'
                        }`}
                      >
                        {t(`st.${a.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.status === 'active' && (
                        <form action={deactivateAccountAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className={btnCls}>
                            {t('deactivate')}
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
      </section>

      {/* Access requests */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('requests')}</h2>
        {requests.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('empty')} />
          </div>
        ) : (
          <ul
            className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            data-testid="access-requests-list"
          >
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
              >
                <span className="font-medium text-foreground">{r.system ?? '—'}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary">
                    {t(`st.${r.status}`)}
                  </span>
                  {r.status === 'pending' && (
                    <>
                      <form action={decideAccessRequestAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <button type="submit" className={btnCls}>
                          {t('approve')}
                        </button>
                      </form>
                      <form action={decideAccessRequestAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <button type="submit" className={btnCls}>
                          {t('reject')}
                        </button>
                      </form>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
