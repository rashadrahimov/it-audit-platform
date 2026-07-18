import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createQuestionnaireAction } from './actions';

export const dynamic = 'force-dynamic';

type Status = 'draft' | 'submitted';
interface Questionnaire {
  id: string;
  title: string;
  source: string | null;
  status: Status;
}

const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-amber-100 text-amber-700',
  submitted: 'bg-emerald-100 text-emerald-700',
};

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Опросники безопасности (T-083): список + создание. */
export default async function QuestionnairesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('questionnaires'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/questionnaires', { headers });
  const items: Questionnaire[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      <form
        action={createQuestionnaireAction}
        data-testid="questionnaire-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <input name="title" required placeholder={t('titlePh')} className={`flex-1 ${inputCls}`} />
        <input name="source" placeholder={t('source')} className={inputCls} />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {items.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="questionnaires-list">
          {items.map((q) => (
            <li key={q.id}>
              <Link
                href={`/questionnaires/${q.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white p-4 shadow-sm transition-colors duration-150 hover:bg-muted"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">{q.title}</span>
                  {q.source && <span className="text-xs text-secondary">{q.source}</span>}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[q.status]}`}
                >
                  {t(`st.${q.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
