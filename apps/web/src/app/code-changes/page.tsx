import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createChangeAction, transitionChangeAction } from './actions';

export const dynamic = 'force-dynamic';

type Status = 'requested' | 'approved' | 'rejected' | 'deployed';
interface Change {
  id: string;
  title: string;
  type: string | null;
  risk: string | null;
  status: Status;
}

const STATUS_TONE: Record<Status, string> = {
  requested: 'bg-sky-100 text-sky-700',
  approved: 'bg-indigo-100 text-indigo-700',
  rejected: 'bg-muted text-secondary',
  deployed: 'bg-emerald-100 text-emerald-700',
};
const NEXT: Record<Status, Status[]> = {
  requested: ['approved', 'rejected'],
  approved: ['deployed'],
  rejected: [],
  deployed: [],
};
const RISKS = ['low', 'medium', 'high'];

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Change management (T-063): создание + approval-workflow. */
export default async function CodeChangesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('codeChanges'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/changes', { headers });
  const changes: Change[] = res.ok ? await res.json() : [];

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
        action={createChangeAction}
        data-testid="change-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <input name="title" required placeholder={t('titlePh')} className={`flex-1 ${inputCls}`} />
        <input name="type" placeholder={t('type')} className={inputCls} />
        <select name="risk" defaultValue="medium" className={inputCls}>
          {RISKS.map((r) => (
            <option key={r} value={r}>
              {t(`risks.${r}`)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {changes.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="changes-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('type')}</th>
                <th className="px-4 py-3 font-medium">{t('status')}</th>
                <th className="px-4 py-3 font-medium">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{c.title}</td>
                  <td className="px-4 py-3 text-secondary">{c.type ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[c.status]}`}
                    >
                      {t(`st.${c.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {NEXT[c.status].length > 0 && (
                      <form action={transitionChangeAction} className="flex gap-1">
                        <input type="hidden" name="id" value={c.id} />
                        {NEXT[c.status].map((to) => (
                          <button
                            key={to}
                            type="submit"
                            name="to"
                            value={to}
                            className="rounded-md border border-border px-2 py-1 text-xs text-secondary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {t(`st.${to}`)}
                          </button>
                        ))}
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
