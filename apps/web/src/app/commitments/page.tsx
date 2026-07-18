import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createCommitmentAction, setCommitmentStatusAction } from './actions';

export const dynamic = 'force-dynamic';

type Status = 'met' | 'at_risk' | 'breached';
const STATUSES: Status[] = ['met', 'at_risk', 'breached'];
type Sla = 'ok' | 'due_soon' | 'overdue';
interface Commitment {
  id: string;
  title: string;
  source: string | null;
  status: Status;
  slaStatus: Sla;
  dueDate: string | null;
}

const STATUS_TONE: Record<Status, string> = {
  met: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-amber-100 text-amber-700',
  breached: 'bg-red-100 text-red-700',
};
const SLA_TONE: Record<Sla, string> = {
  ok: 'text-secondary',
  due_soon: 'text-amber-700',
  overdue: 'text-destructive font-medium',
};

/** Commitments (T-077): контрактные обязательства со статусом и SLA. */
export default async function CommitmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('commitments'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/commitments', { headers });
  const commitments: Commitment[] = res.ok ? await res.json() : [];

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
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {commitments.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="commitments-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('source')}</th>
                <th className="px-4 py-3 font-medium">—</th>
                <th className="px-4 py-3 font-medium">{t('sla')}</th>
                <th className="px-4 py-3 font-medium">{t('change')}</th>
              </tr>
            </thead>
            <tbody>
              {commitments.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{c.title}</td>
                  <td className="px-4 py-3 text-secondary">{c.source ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[c.status]}`}>
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
    </main>
  );
}
