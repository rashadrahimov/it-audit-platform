import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { createAccessReviewAction } from './actions';

export const dynamic = 'force-dynamic';

type Status = 'draft' | 'in_progress' | 'completed';
interface Review {
  id: string;
  title: string;
  status: Status;
}

const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-muted text-secondary',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

/** Access reviews / UAR (T-055): кампании ревью доступа со статусом. */
export default async function AccessReviewsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('accessReviews'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [res, accRes] = await Promise.all([
    apiFetch('/access-reviews', { headers }),
    apiFetch('/accounts', { headers }),
  ]);
  const reviews: Review[] = res.ok ? await res.json() : [];
  const accounts: Array<{ id: string; identifier: string; status: string }> = accRes.ok
    ? await accRes.json()
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form
        action={createAccessReviewAction}
        data-testid="review-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('createTitle')}</span>
          <input
            name="title"
            required
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('createDue')}</span>
          <input
            type="date"
            name="dueDate"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <fieldset className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-secondary">{t('createScope')}</span>
          {accounts
            .filter((a) => a.status === 'active')
            .map((a) => (
              <label key={a.id} className="flex items-center gap-1.5 text-foreground">
                <input type="checkbox" name="accountId" value={a.id} />
                {a.identifier}
              </label>
            ))}
        </fieldset>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('createBtn')}
        </button>
      </form>

      {reviews.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="access-reviews">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
            >
              <Link
                href={`/access-reviews/${r.id}`}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                {r.title}
              </Link>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[r.status]}`}
              >
                {t(`st.${r.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
