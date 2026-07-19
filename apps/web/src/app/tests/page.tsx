import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { filterQuery } from '@/lib/filters';

export const dynamic = 'force-dynamic';

interface TestRow {
  id: string;
  title: string;
  kind: string;
  frequency: string | null;
  status: string;
  slaStatus: string | null;
  dueDate: string | null;
  controlRef: string;
  owner: string | null;
}
interface Attention {
  counts: { overdue: number; dueSoon: number; failing: number };
}

const STATUSES = ['ok', 'failing', 'needs_attention', 'deactivated'] as const;
const KINDS = ['manual', 'automated'] as const;
const SLAS = ['ok', 'due_soon', 'overdue'] as const;

const STATUS_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  failing: 'bg-red-100 text-red-700',
  needs_attention: 'bg-amber-100 text-amber-700',
  deactivated: 'bg-muted text-secondary',
};
const SLA_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

/** Реестр тестов (T-V06): attention-сводка + таблица с фильтрами. */
export default async function TestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; slaStatus?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tFilters, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('tests'),
    getTranslations('filters'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const [listRes, attnRes] = await Promise.all([
    apiFetch(`/tests?locale=${locale}${filterQuery(sp, ['status', 'kind', 'slaStatus'])}`, {
      headers,
    }),
    apiFetch(`/tests/attention?locale=${locale}`, { headers }),
  ]);
  const tests: TestRow[] = listRes.ok ? await listRes.json() : [];
  const attention: Attention | null = attnRes.ok ? await attnRes.json() : null;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  const attnCards = attention
    ? ([
        ['attnOverdue', attention.counts.overdue, 'text-red-700'],
        ['attnDueSoon', attention.counts.dueSoon, 'text-amber-700'],
        ['attnFailing', attention.counts.failing, 'text-orange-700'],
      ] as const)
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {attention && (
        <section className="grid grid-cols-3 gap-3" data-testid="tests-attention">
          {attnCards.map(([key, count, tone]) => (
            <div key={key} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className={`text-2xl font-bold tabular-nums ${tone}`}>{count}</div>
              <div className="text-xs font-medium text-secondary">{t(key)}</div>
            </div>
          ))}
        </section>
      )}

      <FilterBar
        basePath="/tests"
        sp={sp}
        allLabel={tFilters('all')}
        groups={[
          {
            param: 'status',
            label: tFilters('status'),
            options: STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) })),
          },
          {
            param: 'kind',
            label: t('colKind'),
            options: KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })),
          },
          {
            param: 'slaStatus',
            label: t('colSla'),
            options: SLAS.map((s) => ({ value: s, label: t(`slas.${s}`) })),
          },
        ]}
      />

      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="tests-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('colTitle')}</th>
              <th className="px-4 py-3 font-medium">{t('colControl')}</th>
              <th className="px-4 py-3 font-medium">{t('colKind')}</th>
              <th className="px-4 py-3 font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('colSla')}</th>
              <th className="px-4 py-3 font-medium">{t('colOwner')}</th>
              <th className="px-4 py-3 font-medium">{t('colDue')}</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/tests/${row.id}`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {row.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-secondary whitespace-nowrap">{row.controlRef}</td>
                <td className="px-4 py-3 text-secondary">{t(`kinds.${row.kind}`)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[row.status] ?? 'bg-muted text-secondary'}`}
                  >
                    {t(`statuses.${row.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.slaStatus ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SLA_TONE[row.slaStatus] ?? 'bg-muted text-secondary'}`}
                    >
                      {t(`slas.${row.slaStatus}`)}
                    </span>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-secondary">{row.owner ?? '—'}</td>
                <td className="px-4 py-3 text-secondary whitespace-nowrap tabular-nums">
                  {row.dueDate ? dateFmt.format(new Date(row.dueDate)) : '—'}
                </td>
              </tr>
            ))}
            {tests.length === 0 && (
              <tr>
                <td colSpan={7} className="p-0">
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
