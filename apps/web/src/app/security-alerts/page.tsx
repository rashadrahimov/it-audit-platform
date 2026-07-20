import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { filterQuery, type SearchParams } from '@/lib/filters';
import { FilterBar } from '@/components/filter-bar';
import { EmptyState } from '@/components/empty-state';
import { createAlertAction, transitionAlertAction } from './actions';

export const dynamic = 'force-dynamic';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Status = 'new' | 'triaged' | 'closed';
type Sla = 'ok' | 'due_soon' | 'overdue';
type Category =
  'malware' | 'phishing' | 'vulnerability' | 'misconfiguration' | 'unauthorized_access' | 'other';

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
  category: Category | null;
  assetId: string | null;
  assetName: string | null;
  dueDate: string | null;
  slaStatus: Sla;
}
interface AssetOpt {
  id: string;
  name: string;
}

const CATEGORIES: Category[] = [
  'malware',
  'phishing',
  'vulnerability',
  'misconfiguration',
  'unauthorized_access',
  'other',
];
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
const SLA_BADGE: Record<Sla, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Security alerts (T-064/T-V40): категории, привязка к активам, resolution SLA-окна. */
export default async function SecurityAlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('securityAlerts'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  let alerts: Alert[] = [];
  let assets: AssetOpt[] = [];
  if (tenantSlug) {
    // filterQuery отдаёт «&k=v…» (для append после ?…) → первый & меняем на ?
    const qs = filterQuery(sp, ['severity', 'category', 'status']);
    const [res, assetsRes] = await Promise.all([
      apiFetch(`/security-alerts${qs ? `?${qs.slice(1)}` : ''}`, { headers }),
      apiFetch('/assets', { headers }),
    ]);
    alerts = res.ok ? await res.json() : [];
    assets = assetsRes.ok ? await assetsRes.json() : [];
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form
        action={createAlertAction}
        data-testid="alert-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <input name="title" required placeholder={t('titlePh')} className={`flex-1 ${inputCls}`} />
        <select
          name="severity"
          defaultValue="medium"
          className={inputCls}
          aria-label={t('severity')}
        >
          {(['low', 'medium', 'high', 'critical'] as Severity[]).map((s) => (
            <option key={s} value={s}>
              {t(`sev.${s}`)}
            </option>
          ))}
        </select>
        <select name="category" defaultValue="" className={inputCls} aria-label={t('category')}>
          <option value="">{t('catNone')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`cat.${c}`)}
            </option>
          ))}
        </select>
        <select name="assetId" defaultValue="" className={inputCls} aria-label={t('asset')}>
          <option value="">{t('assetNone')}</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          data-testid="alert-create-submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      <FilterBar
        basePath="/security-alerts"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'severity',
            label: t('severity'),
            options: (['low', 'medium', 'high', 'critical'] as Severity[]).map((s) => ({
              value: s,
              label: t(`sev.${s}`),
            })),
          },
          {
            param: 'category',
            label: t('category'),
            options: CATEGORIES.map((c) => ({ value: c, label: t(`cat.${c}`) })),
          },
          {
            param: 'status',
            label: t('statusHead'),
            options: (['new', 'triaged', 'closed'] as Status[]).map((s) => ({
              value: s,
              label: t(`st.${s}`),
            })),
          },
        ]}
      />

      {alerts.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="security-alerts-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('category')}</th>
                <th className="px-4 py-3 font-medium">{t('asset')}</th>
                <th className="px-4 py-3 font-medium">{t('severity')}</th>
                <th className="px-4 py-3 font-medium">{t('slaHead')}</th>
                <th className="px-4 py-3 font-medium">{t('statusHead')}</th>
                <th className="px-4 py-3 font-medium">{t('triage')}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{a.title}</td>
                  <td className="px-4 py-3 text-secondary">
                    {a.category ? t(`cat.${a.category}`) : '—'}
                  </td>
                  <td className="px-4 py-3 text-secondary">{a.assetName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEV_TONE[a.severity]}`}
                    >
                      {t(`sev.${a.severity}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.status === 'closed' ? (
                      <span className="text-xs text-secondary">—</span>
                    ) : (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SLA_BADGE[a.slaStatus]}`}
                        title={a.dueDate ? dateFmt.format(new Date(a.dueDate)) : undefined}
                      >
                        {t(`slaSt.${a.slaStatus}`)}
                      </span>
                    )}
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
