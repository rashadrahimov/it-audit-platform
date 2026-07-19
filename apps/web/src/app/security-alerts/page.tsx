import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { transitionAlertAction } from './actions';

export const dynamic = 'force-dynamic';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Status = 'new' | 'triaged' | 'closed';
/** Разрешённые переходы triage (T-064). */
const NEXT: Record<Status, Status[]> = {
  new: ['triaged', 'closed'],
  triaged: ['closed'],
  closed: [],
};
interface Alert {
  id: string;
  title: string;
  source: string | null;
  severity: Severity;
  status: Status;
}

const SEV_TONE: Record<Severity, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};
const STATUS_TONE: Record<Status, string> = {
  new: 'bg-sky-100 text-sky-700',
  triaged: 'bg-amber-100 text-amber-700',
  closed: 'bg-muted text-secondary',
};

/** Security alerts (T-064): сигналы из коннекторов/сканеров, triage new→triaged→closed. */
export default async function SecurityAlertsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('securityAlerts'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/security-alerts', { headers });
  const alerts: Alert[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {alerts.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="security-alerts-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('source')}</th>
                <th className="px-4 py-3 font-medium">{t('severity')}</th>
                <th className="px-4 py-3 font-medium">—</th>
                <th className="px-4 py-3 font-medium">{t('triage')}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{a.title}</td>
                  <td className="px-4 py-3 text-secondary">{a.source ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEV_TONE[a.severity]}`}
                    >
                      {t(`sev.${a.severity}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[a.status]}`}
                    >
                      {t(`st.${a.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {NEXT[a.status].length > 0 && (
                      <form action={transitionAlertAction} className="flex gap-1">
                        <input type="hidden" name="id" value={a.id} />
                        {NEXT[a.status].map((to) => (
                          <button
                            key={to}
                            type="submit"
                            name="to"
                            value={to}
                            className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
