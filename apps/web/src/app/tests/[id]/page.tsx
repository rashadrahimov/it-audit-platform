import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { deactivateTestAction, runAutoTestAction, updateTestAction } from '../actions';

export const dynamic = 'force-dynamic';

interface TestDetail {
  id: string;
  title: string;
  kind: string;
  frequency: string | null;
  status: string;
  slaStatus: string | null;
  dueDate: string | null;
  controlId: string;
  controlRef: string | null;
  connectorId: string | null;
  ownerMembershipId: string | null;
  owner: string | null;
  results: Array<{
    runAt: string;
    outcome: string;
    failingEntities: unknown;
    evidenceDocumentId: string | null;
  }>;
}
interface Member {
  id: string;
  fullName: string;
  role: string;
}

const STATUS_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  failing: 'bg-red-100 text-red-700',
  needs_attention: 'bg-amber-100 text-amber-700',
  deactivated: 'bg-muted text-secondary',
};
const OUTCOME_TONE: Record<string, string> = {
  pass: 'bg-emerald-100 text-emerald-700',
  fail: 'bg-red-100 text-red-700',
  error: 'bg-amber-100 text-amber-700',
};

const primaryBtn =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const secondaryBtn =
  'rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Карточка теста (T-V06): конфиг, правка, деактивация, история прогонов. */
export default async function TestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, { id }] = await Promise.all([
    getTranslations('tests'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    params,
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const res = await apiFetch(`/tests/${id}?locale=${locale}`, { headers });
  if (!res.ok) redirect('/tests');
  const test: TestDetail = await res.json();
  const mRes = await apiFetch(`/memberships?locale=${locale}`, { headers });
  const members: Member[] = mRes.ok ? await mRes.json() : [];

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const active = test.status !== 'deactivated';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div>
        <Link
          href="/tests"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          ← {t('back')}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3" data-testid="test-header">
        <h1 className="text-2xl font-bold text-primary">{test.title}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[test.status] ?? 'bg-muted text-secondary'}`}
        >
          {t(`statuses.${test.status}`)}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
          {t(`kinds.${test.kind}`)}
        </span>
      </header>

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="test-fields"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('colControl')}</dt>
            <dd className="text-sm text-foreground">
              <Link href={`/controls/${test.controlId}`} className="text-accent hover:underline">
                {test.controlRef ?? test.controlId}
              </Link>
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('colOwner')}</dt>
            <dd className="text-sm text-foreground">{test.owner ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('frequency')}</dt>
            <dd className="text-sm text-foreground">{test.frequency ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('colDue')}</dt>
            <dd className="text-sm text-foreground">
              {test.dueDate ? dateFmt.format(new Date(test.dueDate)) : '—'}
              {test.slaStatus && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                  {t(`slas.${test.slaStatus}`)}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {active && (
        <section
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="test-edit"
        >
          <form
            action={updateTestAction.bind(null, test.id)}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('editTitle')}</span>
              <input
                name="title"
                defaultValue={test.title}
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('frequency')}</span>
              <input
                name="frequency"
                defaultValue={test.frequency ?? ''}
                className="w-28 rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('colDue')}</span>
              <input
                type="date"
                name="dueDate"
                defaultValue={test.dueDate ? test.dueDate.slice(0, 10) : ''}
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            {members.length > 0 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-secondary">{t('colOwner')}</span>
                <select
                  name="ownerMembershipId"
                  defaultValue=""
                  className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="">{t('ownerNone')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className={primaryBtn} data-testid="test-save">
              {t('editSave')}
            </button>
          </form>
          {test.kind === 'automated' && test.connectorId && (
            <form action={runAutoTestAction.bind(null, test.id)}>
              <button type="submit" className={secondaryBtn} data-testid="test-run-auto">
                {t('runAuto')}
              </button>
            </form>
          )}
          <form action={deactivateTestAction.bind(null, test.id)}>
            <button type="submit" className={secondaryBtn} data-testid="test-deactivate">
              {t('deactivate')}
            </button>
          </form>
        </section>
      )}

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="test-history"
      >
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('history')}</h2>
        {test.results.length === 0 ? (
          <p className="text-sm text-secondary">{t('historyEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="px-3 py-2 font-medium">{t('runAt')}</th>
                  <th className="px-3 py-2 font-medium">{t('outcome')}</th>
                  <th className="px-3 py-2 font-medium">{t('failingEntities')}</th>
                  <th className="px-3 py-2 font-medium">{t('evidence')}</th>
                </tr>
              </thead>
              <tbody>
                {test.results.map((r, i) => {
                  const failing = Array.isArray(r.failingEntities) ? r.failingEntities : [];
                  return (
                    <tr key={i} className="border-b border-border align-top last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap text-secondary tabular-nums">
                        {dateTimeFmt.format(new Date(r.runAt))}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_TONE[r.outcome] ?? 'bg-muted text-secondary'}`}
                        >
                          {r.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-secondary">
                        {failing.length === 0 ? (
                          '—'
                        ) : (
                          <ul className="flex flex-col gap-0.5">
                            {failing.slice(0, 10).map((fe, j) => (
                              <li key={j}>
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {typeof fe === 'string' ? fe : JSON.stringify(fe)}
                                </code>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.evidenceDocumentId ? (
                          <a
                            href={`/documents/${r.evidenceDocumentId}/download`}
                            className="text-accent underline-offset-2 hover:underline"
                          >
                            {t('evidence')}
                          </a>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
