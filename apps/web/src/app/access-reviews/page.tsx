import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

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

  const res = await apiFetch('/access-reviews', { headers });
  const reviews: Review[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {reviews.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="access-reviews">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
            >
              <span className="font-medium text-foreground">{r.title}</span>
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
