import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import {
  createCommitmentAction,
  createContractAction,
  deleteContractAction,
  setCommitmentContractAction,
  setCommitmentDetailsAction,
  setCommitmentStatusAction,
} from './actions';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

type Status = 'met' | 'at_risk' | 'breached';
const STATUSES: Status[] = ['met', 'at_risk', 'breached'];
type Sla = 'ok' | 'due_later' | 'due_soon' | 'overdue';
interface Commitment {
  id: string;
  title: string;
  source: string | null;
  status: Status;
  slaStatus: Sla;
  dueDate: string | null;
  contractId: string | null;
  contractName: string | null;
  owner: string | null;
  ownerMembershipId: string | null;
}
interface Member {
  id: string;
  fullName: string;
}
interface Contract {
  id: string;
  name: string;
  counterparty: string | null;
  status: string;
  endDate: string | null;
}

const STATUS_TONE: Record<Status, string> = {
  met: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-amber-100 text-amber-700',
  breached: 'bg-red-100 text-red-700',
};
const SLA_TONE: Record<Sla, string> = {
  ok: 'text-secondary',
  due_later: 'text-blue-700',
  due_soon: 'text-amber-700',
  overdue: 'text-destructive font-medium',
};

/** Commitments (T-077, T-V31): обязательства + вкладка контрактов + привязка commitment↔contract. */
export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('commitments'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
  const tab = sp.tab === 'contracts' ? 'contracts' : 'commitments';

  const [cRes, ctRes, memRes] = await Promise.all([
    apiFetch('/commitments', { headers }),
    apiFetch('/contracts', { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
  ]);
  const commitments: Commitment[] = cRes.ok ? await cRes.json() : [];
  const contracts: Contract[] = ctRes.ok ? await ctRes.json() : [];
  const members: Member[] = memRes.ok ? await memRes.json() : [];

  const tabCls = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
      on ? 'bg-accent text-on-primary' : 'text-secondary hover:bg-muted'
    }`;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <nav data-testid="commitments-tabs" className="flex gap-1">
        <Link href="/commitments" className={tabCls(tab === 'commitments')}>
          {t('tabCommitments')}
        </Link>
        <Link href="/commitments?tab=contracts" className={tabCls(tab === 'contracts')}>
          {t('tabContracts')}
        </Link>
      </nav>

      {tab === 'contracts' ? (
        <>
          <form
            action={createContractAction}
            data-testid="contract-create"
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('contractName')}</span>
              <input
                name="name"
                required
                placeholder={t('contractNamePh')}
                className="rounded-md border border-border px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </label>
            <input
              name="counterparty"
              placeholder={t('counterparty')}
              className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-secondary">{t('endDate')}</span>
              <input
                type="date"
                name="endDate"
                className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('addContract')}
            </button>
          </form>

          {contracts.length === 0 ? (
            <section className="rounded-xl border border-border bg-white shadow-sm">
              <EmptyState text={t('contractsEmpty')} />
            </section>
          ) : (
            <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <table className="w-full text-left text-sm" data-testid="contracts-table">
                <thead>
                  <tr className="border-b border-border text-secondary">
                    <th className="px-4 py-3 font-medium">{t('contractName')}</th>
                    <th className="px-4 py-3 font-medium">{t('counterparty')}</th>
                    <th className="px-4 py-3 font-medium">{t('statusHead')}</th>
                    <th className="px-4 py-3 font-medium">{t('endDate')}</th>
                    <th className="px-4 py-3 font-medium">{t('change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-3 text-secondary">{c.counterparty ?? '—'}</td>
                      <td className="px-4 py-3 text-secondary">{t(`cst.${c.status}`)}</td>
                      <td className="px-4 py-3 text-secondary whitespace-nowrap">
                        {c.endDate ? c.endDate.slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <form action={deleteContractAction.bind(null, c.id)}>
                          <button
                            type="submit"
                            data-testid={`contract-delete-${c.id}`}
                            className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted"
                          >
                            {t('del')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      ) : (
        <>
          <form
            action={createCommitmentAction}
            data-testid="commitment-create"
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('create')}</span>
              <input
                name="title"
                required
                placeholder={t('titlePh')}
                className="rounded-md border border-border px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </label>
            <input
              name="source"
              placeholder={t('sourcePh')}
              className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            {contracts.length > 0 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-secondary">{t('contract')}</span>
                <select
                  name="contractId"
                  className="rounded-md border border-border bg-white px-2 py-2 text-sm text-foreground"
                >
                  <option value="">{t('contractNone')}</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('add')}
            </button>
          </form>

          {commitments.length === 0 ? (
            <section className="rounded-xl border border-border bg-white shadow-sm">
              <EmptyState text={t('empty')} />
            </section>
          ) : (
            <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <table className="w-full text-left text-sm" data-testid="commitments-table">
                <thead>
                  <tr className="border-b border-border text-secondary">
                    <th className="px-4 py-3 font-medium">{t('title')}</th>
                    <th className="px-4 py-3 font-medium">{t('contract')}</th>
                    <th className="px-4 py-3 font-medium">{t('editOwner')}</th>
                    <th className="px-4 py-3 font-medium">{t('statusHead')}</th>
                    <th className="px-4 py-3 font-medium">{t('slaHead')}</th>
                    <th className="px-4 py-3 font-medium">{t('change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3 font-medium text-foreground">{c.title}</td>
                      <td className="px-4 py-3">
                        <form
                          action={setCommitmentContractAction.bind(null, c.id)}
                          className="flex items-center gap-1.5"
                        >
                          <select
                            name="contractId"
                            defaultValue={c.contractId ?? ''}
                            data-testid={`commitment-contract-${c.id}`}
                            className="rounded-md border border-border bg-white px-1.5 py-1 text-xs text-foreground"
                          >
                            <option value="">{t('contractNone')}</option>
                            {contracts.map((ct) => (
                              <option key={ct.id} value={ct.id}>
                                {ct.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-md border border-border px-1.5 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted"
                          >
                            {t('link')}
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3">
                        <form
                          action={setCommitmentDetailsAction.bind(null, c.id)}
                          className="flex items-center gap-1.5"
                          data-testid={`commitment-details-${c.id}`}
                        >
                          <select
                            name="ownerMembershipId"
                            defaultValue={c.ownerMembershipId ?? ''}
                            className="rounded-md border border-border bg-white px-1.5 py-1 text-xs text-foreground"
                          >
                            <option value="">{t('ownerNone')}</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.fullName}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            name="dueDate"
                            defaultValue={c.dueDate ? c.dueDate.slice(0, 10) : ''}
                            className="rounded-md border border-border bg-white px-1 py-1 text-xs text-foreground"
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-border px-1.5 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted"
                          >
                            {t('save')}
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[c.status]}`}
                        >
                          {t(`st.${c.status}`)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-xs ${SLA_TONE[c.slaStatus]}`}>
                        {t(`sla.${c.slaStatus}`)}
                      </td>
                      <td className="px-4 py-3">
                        <form action={setCommitmentStatusAction} className="flex gap-1">
                          <input type="hidden" name="id" value={c.id} />
                          {STATUSES.filter((s) => s !== c.status).map((s) => (
                            <button
                              key={s}
                              type="submit"
                              name="status"
                              value={s}
                              className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              {t(`st.${s}`)}
                            </button>
                          ))}
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </main>
  );
}
