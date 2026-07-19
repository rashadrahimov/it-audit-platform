import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { filterQuery } from '@/lib/filters';

export const dynamic = 'force-dynamic';

interface FindingRow {
  id: string;
  title: string;
  riskRating: string;
  status: string;
  slaStatus: string | null;
  dueDate: string | null;
  owner: string | null;
  auditor: string | null;
}

const STATUSES = [
  'identified',
  'assigned',
  'in_progress',
  'remediated',
  'pending_retest',
  'closed',
] as const;
const RATINGS = ['critical', 'high', 'medium', 'low', 'not_applicable'] as const;
const SLAS = ['ok', 'due_soon', 'overdue'] as const;

const RATING_TONE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
  not_applicable: 'bg-muted text-secondary',
};
const SLA_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

/** Реестр findings тенанта (T-V03): фильтры + SLA-бейджи + ссылки на карточки. */
export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    riskRating?: string;
    slaStatus?: string;
    mine?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('findings'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);

  let findings: FindingRow[] = [];
  if (tenantSlug) {
    const res = await apiFetch(
      `/findings?locale=${locale}${filterQuery(sp, ['status', 'riskRating', 'slaStatus', 'mine'])}`,
      { headers: { 'X-Tenant-Slug': tenantSlug } },
    );
    findings = res.ok ? await res.json() : [];
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <FilterBar
        basePath="/findings"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'mine',
            label: tFilters('scope'),
            options: [{ value: 'true', label: tFilters('ownedByMe') }],
          },
          {
            param: 'status',
            label: tFilters('status'),
            options: STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) })),
          },
          {
            param: 'riskRating',
            label: t('colRating'),
            options: RATINGS.map((r) => ({ value: r, label: t(`ratings.${r}`) })),
          },
          {
            param: 'slaStatus',
            label: t('colSla'),
            options: SLAS.map((s) => ({ value: s, label: t(`slas.${s}`) })),
          },
        ]}
      />
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="findings-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('colTitle')}</th>
              <th className="px-4 py-3 font-medium">{t('colRating')}</th>
              <th className="px-4 py-3 font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('colSla')}</th>
              <th className="px-4 py-3 font-medium">{t('colOwner')}</th>
              <th className="px-4 py-3 font-medium">{t('colDue')}</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/findings/${f.id}`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {f.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${RATING_TONE[f.riskRating] ?? 'bg-muted text-secondary'}`}
                  >
                    {t(`ratings.${f.riskRating}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-secondary">
                    {t(`statuses.${f.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {f.slaStatus ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SLA_TONE[f.slaStatus] ?? 'bg-muted text-secondary'}`}
                    >
                      {t(`slas.${f.slaStatus}`)}
                    </span>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-secondary">{f.owner ?? '—'}</td>
                <td className="px-4 py-3 text-secondary tabular-nums">
                  {f.dueDate ? dateFmt.format(new Date(f.dueDate)) : '—'}
                </td>
              </tr>
            ))}
            {findings.length === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
