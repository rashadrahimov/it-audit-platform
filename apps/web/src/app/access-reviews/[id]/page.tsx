import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { decideReviewItemAction } from '../actions';

export const dynamic = 'force-dynamic';

interface ReviewDetail {
  id: string;
  title: string;
  status: string;
  items: Array<{
    id: string;
    account: string;
    displayName: string | null;
    mfaEnabled: boolean | null;
    decision: string | null;
  }>;
}

const DECISION_TONE: Record<string, string> = {
  certify: 'bg-emerald-100 text-emerald-700',
  revoke: 'bg-red-100 text-red-700',
  modify: 'bg-amber-100 text-amber-700',
};

const btnCls =
  'rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Карточка UAR-кампании (T-V08): пункты с решениями certify/revoke/modify. */
export default async function AccessReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, { id }] = await Promise.all([
    getTranslations('accessReviews'),
    getActiveTenantSlug(),
    params,
  ]);
  if (!tenantSlug) redirect('/account');

  const res = await apiFetch(`/access-reviews/${id}`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (!res.ok) redirect('/access-reviews');
  const review: ReviewDetail = await res.json();
  const decided = review.items.filter((i) => i.decision !== null).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div>
        <Link
          href="/access-reviews"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          ← {t('back')}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3" data-testid="review-header">
        <h1 className="text-2xl font-bold text-primary">{review.title}</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
          {t(`st.${review.status}`)}
        </span>
        <span className="text-sm text-secondary tabular-nums">
          {decided}/{review.items.length}
        </span>
      </header>

      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="review-items">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('itemAccount')}</th>
              <th className="px-4 py-3 font-medium">MFA</th>
              <th className="px-4 py-3 font-medium">{t('itemDecision')}</th>
            </tr>
          </thead>
          <tbody>
            {review.items.map((i) => (
              <tr key={i.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium text-foreground">{i.account}</span>
                  {i.displayName && (
                    <span className="ml-2 text-xs text-secondary">{i.displayName}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-secondary">
                  {i.mfaEnabled === null ? '—' : i.mfaEnabled ? '✓' : '✕'}
                </td>
                <td className="px-4 py-3">
                  {i.decision ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${DECISION_TONE[i.decision] ?? 'bg-muted text-secondary'}`}
                    >
                      {t(`dec.${i.decision}`)}
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {(['certify', 'revoke', 'modify'] as const).map((d) => (
                        <form
                          key={d}
                          action={decideReviewItemAction.bind(null, review.id, i.id, d)}
                        >
                          <button type="submit" className={btnCls} data-testid={`decide-${d}`}>
                            {t(`dec.${d}`)}
                          </button>
                        </form>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
