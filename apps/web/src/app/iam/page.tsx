import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import {
  completeDeprovisioningAction,
  createDeprovisioningAction,
  deactivateAccountAction,
  decideAccessRequestAction,
  setAccountOwnerAction,
} from './actions';
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
  ownerMembershipId: string | null;
  owner: string | null;
}
interface AccessRequest {
  id: string;
  system: string | null;
  status: 'pending' | 'approved' | 'rejected';
  justification: string | null;
  requester: string | null;
  approver: string | null;
}
interface Deprovisioning {
  id: string;
  account: string;
  dueDate: string | null;
  slaStatus: string | null;
  status: string;
}
interface Member {
  id: string;
  fullName: string;
}

const btnCls =
  'rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** IAM — accounts (T-054) + access requests (T-056): деактивация, approve/reject. */
export default async function IamPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('iam'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [accRes, reqRes, depRes, mRes] = await Promise.all([
    apiFetch('/accounts', { headers }),
    apiFetch('/access-requests', { headers }),
    apiFetch('/deprovisioning-tasks', { headers }),
    apiFetch('/memberships', { headers }),
  ]);
  const accounts: Account[] = accRes.ok ? await accRes.json() : [];
  const requests: AccessRequest[] = reqRes.ok ? await reqRes.json() : [];
  const deprovisioning: Deprovisioning[] = depRes.ok ? await depRes.json() : [];
  const members: Member[] = mRes.ok ? await mRes.json() : [];

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
                  <th className="px-4 py-3 font-medium">{t('owner')}</th>
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
                      {members.length > 0 ? (
                        <form
                          action={setAccountOwnerAction.bind(null, a.id)}
                          className="flex items-center gap-1.5"
                        >
                          <select
                            name="ownerMembershipId"
                            defaultValue={a.ownerMembershipId ?? ''}
                            className="rounded-md border border-border bg-white px-1.5 py-1 text-xs text-foreground"
                          >
                            <option value="">—</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.fullName}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={btnCls}>
                            OK
                          </button>
                        </form>
                      ) : (
                        (a.owner ?? '—')
                      )}
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
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-foreground">{r.system ?? '—'}</span>
                  <span className="text-xs text-secondary">
                    {r.requester ?? '—'}
                    {r.justification ? ` · ${r.justification}` : ''}
                    {r.approver ? ` → ${r.approver}` : ''}
                  </span>
                </span>
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
      {/* Deprovisioning (T-V07) */}
      <section className="flex flex-col gap-3" data-testid="deprovisioning-section">
        <h2 className="text-sm font-semibold text-secondary">{t('deprovisioning')}</h2>
        <form
          action={createDeprovisioningAction}
          data-testid="deprovisioning-create"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('depAccount')}</span>
            <select
              name="accountId"
              required
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
            >
              {accounts
                .filter((a) => a.status === 'active')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.identifier}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('depReason')}</span>
            <input
              name="reason"
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('depDue')}</span>
            <input
              type="date"
              name="dueDate"
              className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <button type="submit" className={btnCls}>
            {t('depCreate')}
          </button>
        </form>
        {deprovisioning.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('empty')} />
          </div>
        ) : (
          <ul
            className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            data-testid="deprovisioning-list"
          >
            {deprovisioning.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
              >
                <span className="font-medium text-foreground">{d.account}</span>
                <span className="flex items-center gap-2">
                  {d.slaStatus && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.slaStatus === 'overdue'
                          ? 'bg-red-100 text-red-700'
                          : d.slaStatus === 'due_soon'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {d.slaStatus}
                    </span>
                  )}
                  <form action={completeDeprovisioningAction.bind(null, d.id)}>
                    <button type="submit" className={btnCls} data-testid="deprovisioning-complete">
                      {t('depComplete')}
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
