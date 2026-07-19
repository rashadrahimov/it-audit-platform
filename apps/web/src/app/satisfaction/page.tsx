import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { submitSurveyAction } from './actions';

export const dynamic = 'force-dynamic';

interface Engagement {
  id: string;
  title: string;
}
interface Summary {
  engagementId: string;
  responses: number;
  averageRating: number | null;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Удовлетворённость аудитом (T-097): оценка 1-5 по engagement + средний рейтинг. */
export default async function SatisfactionPage({
  searchParams,
}: {
  searchParams: Promise<{ engagementId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('satisfaction'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const engRes = await apiFetch('/engagements', { headers });
  const engagements: Engagement[] = engRes.ok ? await engRes.json() : [];
  const engagementId = sp.engagementId ?? engagements[0]?.id;

  let summary: Summary | null = null;
  if (engagementId) {
    const sumRes = await apiFetch(`/satisfaction-surveys/summary/${engagementId}`, { headers });
    if (sumRes.ok) summary = await sumRes.json();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* Выбор engagement */}
      <form
        method="GET"
        data-testid="satisfaction-select"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          {t('engagement')}
          <select name="engagementId" defaultValue={engagementId} className={inputCls}>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('show')}
        </button>
      </form>

      {/* Сводка */}
      {summary && (
        <section
          data-testid="satisfaction-summary"
          className="flex items-center gap-6 rounded-xl border border-border bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col">
            <span className="text-3xl font-bold text-primary">
              {summary.averageRating !== null ? summary.averageRating.toFixed(1) : '—'}
            </span>
            <span className="text-xs text-secondary">{t('avgRating')}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-bold text-foreground">{summary.responses}</span>
            <span className="text-xs text-secondary">{t('responses')}</span>
          </div>
        </section>
      )}

      {/* Новая оценка */}
      {engagementId && (
        <form
          action={submitSurveyAction}
          data-testid="satisfaction-submit"
          className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <input type="hidden" name="engagementId" value={engagementId} />
          <span className="text-sm font-semibold text-secondary">{t('rate')}</span>
          <div className="flex flex-wrap gap-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  defaultChecked={n === 5}
                  className="accent-accent"
                />
                {n}
              </label>
            ))}
          </div>
          <input name="comment" placeholder={t('commentPh')} className={inputCls} />
          <button
            type="submit"
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('submit')}
          </button>
        </form>
      )}
    </main>
  );
}
