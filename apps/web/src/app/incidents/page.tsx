import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { filterQuery, type SearchParams } from '@/lib/filters';
import { FilterBar } from '@/components/filter-bar';
import { EmptyState } from '@/components/empty-state';
import { createIncidentAction } from './actions';
import {
  CATEGORIES,
  inputCls,
  NOTIFY_TONE,
  SEV_TONE,
  SEVERITIES,
  SLA_TONE,
  STATUS_TONE,
  STATUSES,
  type Incident,
} from './shared';

export const dynamic = 'force-dynamic';

/** Реестр инцидентов ИБ (T-IR06, EP-INC): фазы реагирования, SLA резолюции, срок уведомления. */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('incidents'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  let incidents: Incident[] = [];
  if (tenantSlug) {
    const qs = filterQuery(sp, ['severity', 'category', 'status']);
    const res = await apiFetch(`/incidents${qs ? `?${qs.slice(1)}` : ''}`, { headers });
    incidents = res.ok ? await res.json() : [];
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const badge = (tone: string) => `rounded-full px-2 py-0.5 text-xs font-medium ${tone}`;
  const open = incidents.filter((i) => i.status !== 'closed').length;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-sm text-secondary">{t('openCount', { count: open })}</p>
      </div>

      <form
        action={createIncidentAction}
        data-testid="incident-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <input name="title" required placeholder={t('titlePh')} className={`flex-1 ${inputCls}`} />
        <select
          name="severity"
          defaultValue="medium"
          className={inputCls}
          aria-label={t('sevHead')}
        >
          {SEVERITIES.map((s) => (
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
        <button
          type="submit"
          data-testid="incident-create-submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      <FilterBar
        basePath="/incidents"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'severity',
            label: t('sevHead'),
            options: SEVERITIES.map((s) => ({ value: s, label: t(`sev.${s}`) })),
          },
          {
            param: 'status',
            label: t('statusHead'),
            options: STATUSES.map((s) => ({ value: s, label: t(`st.${s}`) })),
          },
          {
            param: 'category',
            label: t('category'),
            options: CATEGORIES.map((c) => ({ value: c, label: t(`cat.${c}`) })),
          },
        ]}
      />

      {incidents.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} hint={t('emptyHint')} />
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="incidents-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('refHead')}</th>
                <th className="px-4 py-3 font-medium">{t('titleHead')}</th>
                <th className="px-4 py-3 font-medium">{t('sevHead')}</th>
                <th className="px-4 py-3 font-medium">{t('statusHead')}</th>
                <th className="px-4 py-3 font-medium">{t('commander')}</th>
                <th className="px-4 py-3 font-medium">{t('slaHead')}</th>
                <th className="px-4 py-3 font-medium">{t('notifyHead')}</th>
                <th className="px-4 py-3 font-medium">{t('detectedHead')}</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium tabular-nums text-secondary">
                    <Link href={`/incidents/${i.id}`} className="text-accent hover:underline">
                      {i.ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link href={`/incidents/${i.id}`} className="hover:underline">
                      {i.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={badge(SEV_TONE[i.severity])}>{t(`sev.${i.severity}`)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={badge(STATUS_TONE[i.status])}>{t(`st.${i.status}`)}</span>
                  </td>
                  <td className="px-4 py-3 text-secondary">{i.commanderName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={badge(SLA_TONE[i.slaStatus] ?? 'bg-muted text-secondary')}>
                      {t(`sla.${i.slaStatus}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {i.reportable ? (
                      <span
                        className={badge(NOTIFY_TONE[i.notifyStatus] ?? 'bg-muted text-secondary')}
                      >
                        {t(`notify.${i.notifyStatus}`)}
                      </span>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-secondary">
                    {dateFmt.format(new Date(i.detectedAt))}
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
