import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { transitionVulnAction } from './actions';

export const dynamic = 'force-dynamic';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Status = 'open' | 'remediating' | 'resolved';
type Sla = 'ok' | 'due_soon' | 'overdue';
const NEXT: Record<Status, Status[]> = {
  open: ['remediating', 'resolved'],
  remediating: ['resolved'],
  resolved: [],
};
interface Vulnerability {
  id: string;
  title: string;
  cve: string | null;
  severity: Severity;
  status: Status;
  slaStatus: Sla;
  dueDate: string | null;
}

const SEV_TONE: Record<Severity, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};
const SLA_TONE: Record<Sla, string> = {
  ok: 'text-secondary',
  due_soon: 'text-amber-700',
  overdue: 'text-destructive font-medium',
};

/** Реестр уязвимостей (T-062): CVE, severity, статус, SLA. */
export default async function VulnerabilitiesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('vulnerabilities'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/vulnerabilities', { headers });
  const vulns: Vulnerability[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {vulns.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="vulnerabilities-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('cve')}</th>
                <th className="px-4 py-3 font-medium">{t('severity')}</th>
                <th className="px-4 py-3 font-medium">—</th>
                <th className="px-4 py-3 font-medium">{t('sla')}</th>
                <th className="px-4 py-3 font-medium">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {vulns.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{v.title}</td>
                  <td className="px-4 py-3">
                    {v.cve ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-secondary">
                        {v.cve}
                      </code>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEV_TONE[v.severity]}`}
                    >
                      {t(`sev.${v.severity}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary">{t(`st.${v.status}`)}</td>
                  <td className={`px-4 py-3 text-xs ${SLA_TONE[v.slaStatus]}`}>
                    {t(`sla_s.${v.slaStatus}`)}
                  </td>
                  <td className="px-4 py-3">
                    {NEXT[v.status].length > 0 && (
                      <form action={transitionVulnAction} className="flex gap-1">
                        <input type="hidden" name="id" value={v.id} />
                        {NEXT[v.status].map((to) => (
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
