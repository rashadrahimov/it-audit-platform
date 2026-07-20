import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { filterQuery, type SearchParams } from '@/lib/filters';
import { FilterBar } from '@/components/filter-bar';
import { createVulnAction, transitionVulnAction } from './actions';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Status = 'open' | 'remediating' | 'resolved';
type Sla = 'ok' | 'due_soon' | 'overdue';
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
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
  assetName: string | null;
}
interface AssetOpt {
  id: string;
  name: string;
  type: string;
}
interface AssetGroup {
  assetId: string | null;
  assetName: string | null;
  slaStatus: Sla;
  open: number;
  total: number;
  vulns: Array<{ id: string; title: string; severity: Severity; status: Status; slaStatus: Sla }>;
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
const SLA_BADGE: Record<Sla, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

/**
 * Реестр уязвимостей (T-062, T-V32): CVE, severity, SLA, группировка по активам.
 * T-V53: фильтр по статусу (в т.ч. resolved = «Deactivated/History») и severity.
 */
export default async function VulnerabilitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, tenantSlug, sp] = await Promise.all([
    getTranslations('vulnerabilities'),
    getTranslations('filters'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  // filterQuery отдаёт «&k=v…» → первый & меняем на ?; by-asset остаётся полным (сводка)
  const qs = filterQuery(sp, ['status', 'severity']);
  const [res, byAssetRes, assetsRes] = await Promise.all([
    apiFetch(`/vulnerabilities${qs ? `?${qs.slice(1)}` : ''}`, { headers }),
    apiFetch('/vulnerabilities/by-asset', { headers }),
    apiFetch('/assets', { headers }),
  ]);
  const vulns: Vulnerability[] = res.ok ? await res.json() : [];
  const byAsset: AssetGroup[] = byAssetRes.ok ? await byAssetRes.json() : [];
  const assets: AssetOpt[] = assetsRes.ok ? await assetsRes.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form
        action={createVulnAction}
        data-testid="vuln-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('fTitle')}</span>
          <input
            name="title"
            required
            placeholder={t('fTitlePh')}
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('severity')}</span>
          <select
            name="severity"
            defaultValue="medium"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`sev.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('asset')}</span>
          <select
            name="assetId"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">{t('assetNone')}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          data-testid="vuln-create-btn"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('addBtn')}
        </button>
      </form>

      {byAsset.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="vuln-by-asset"
        >
          <h2 className="text-sm font-semibold text-primary">{t('byAsset')}</h2>
          <ul className="flex flex-col gap-2">
            {byAsset.map((g) => (
              <li
                key={g.assetId ?? 'unassigned'}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {g.assetName ?? t('unassigned')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-secondary">
                    {t('openOfTotal', { open: g.open, total: g.total })}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SLA_BADGE[g.slaStatus]}`}
                  >
                    {t(`sla_s.${g.slaStatus}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FilterBar
        basePath="/vulnerabilities"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'status',
            label: t('statusHead'),
            options: (['open', 'remediating', 'resolved'] as Status[]).map((s) => ({
              value: s,
              label: t(`st.${s}`),
            })),
          },
          {
            param: 'severity',
            label: t('severity'),
            options: SEVERITIES.map((s) => ({ value: s, label: t(`sev.${s}`) })),
          },
        ]}
      />

      {vulns.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="vulnerabilities-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('cve')}</th>
                <th className="px-4 py-3 font-medium">{t('severity')}</th>
                <th className="px-4 py-3 font-medium">{t('asset')}</th>
                <th className="px-4 py-3 font-medium">{t('statusHead')}</th>
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
                  <td className="px-4 py-3 text-secondary">{v.assetName ?? '—'}</td>
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
