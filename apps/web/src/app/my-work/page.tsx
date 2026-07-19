import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { attestFromMyWorkAction } from './actions';

export const dynamic = 'force-dynamic';

interface MyWork {
  findings: Array<{
    id: string;
    title: string;
    status: string;
    slaStatus: string | null;
    dueDate: string | null;
  }>;
  tests: Array<{ id: string; title: string; status: string; slaStatus: string | null }>;
  policiesToApprove: Array<{ id: string; title: string }>;
  attestationsPending: Array<{ policyId: string; title: string }>;
  accessRequests: Array<{ id: string; system: string; status: string }>;
}

const SLA_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

/** My Work (T-V18): персональный лендинг «назначено мне» — аналог Vanta My work. */
export default async function MyWorkPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('myWork'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  if (!tenantSlug) redirect('/account');

  const res = await apiFetch(`/my-work?locale=${locale}`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  const work: MyWork = res.ok
    ? await res.json()
    : {
        findings: [],
        tests: [],
        policiesToApprove: [],
        attestationsPending: [],
        accessRequests: [],
      };
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const total =
    work.findings.length +
    work.tests.length +
    work.policiesToApprove.length +
    work.attestationsPending.length;

  const card = 'rounded-xl border border-border bg-white p-4 shadow-sm';
  const badge = (tone: string) => `rounded-full px-2 py-0.5 text-xs font-medium ${tone}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="mt-1 text-sm text-secondary">
          {total === 0 ? t('allDone') : t('pendingCount', { count: total })}
        </p>
      </div>

      <section className={card} data-testid="mywork-findings">
        <h2 className="mb-2 text-sm font-semibold text-primary">
          {t('findings')}{' '}
          <span className="text-secondary tabular-nums">({work.findings.length})</span>
        </h2>
        {work.findings.length === 0 ? (
          <p className="text-sm text-secondary">{t('none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {work.findings.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/findings/${f.id}`} className="text-accent hover:underline">
                  {f.title}
                </Link>
                <span className="flex items-center gap-1.5">
                  {f.slaStatus && (
                    <span className={badge(SLA_TONE[f.slaStatus] ?? 'bg-muted text-secondary')}>
                      {f.slaStatus}
                    </span>
                  )}
                  <span className="text-xs text-secondary tabular-nums">
                    {f.dueDate ? dateFmt.format(new Date(f.dueDate)) : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} data-testid="mywork-tests">
        <h2 className="mb-2 text-sm font-semibold text-primary">
          {t('tests')} <span className="text-secondary tabular-nums">({work.tests.length})</span>
        </h2>
        {work.tests.length === 0 ? (
          <p className="text-sm text-secondary">{t('none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {work.tests.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/tests/${x.id}`} className="text-accent hover:underline">
                  {x.title}
                </Link>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                  {x.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} data-testid="mywork-approvals">
        <h2 className="mb-2 text-sm font-semibold text-primary">
          {t('approvals')}{' '}
          <span className="text-secondary tabular-nums">({work.policiesToApprove.length})</span>
        </h2>
        {work.policiesToApprove.length === 0 ? (
          <p className="text-sm text-secondary">{t('none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {work.policiesToApprove.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={`/policies/${p.id}`} className="text-accent hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} data-testid="mywork-attestations">
        <h2 className="mb-2 text-sm font-semibold text-primary">
          {t('attestations')}{' '}
          <span className="text-secondary tabular-nums">({work.attestationsPending.length})</span>
        </h2>
        {work.attestationsPending.length === 0 ? (
          <p className="text-sm text-secondary">{t('none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {work.attestationsPending.map((p) => (
              <li key={p.policyId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{p.title}</span>
                <form action={attestFromMyWorkAction.bind(null, p.policyId)}>
                  <button
                    type="submit"
                    data-testid="mywork-attest"
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                  >
                    {t('attestBtn')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} data-testid="mywork-access">
        <h2 className="mb-2 text-sm font-semibold text-primary">
          {t('accessRequests')}{' '}
          <span className="text-secondary tabular-nums">({work.accessRequests.length})</span>
        </h2>
        {work.accessRequests.length === 0 ? (
          <p className="text-sm text-secondary">{t('none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {work.accessRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{r.system}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                  {t(`reqStatuses.${r.status}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
