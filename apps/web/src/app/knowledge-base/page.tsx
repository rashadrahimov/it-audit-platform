import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createKbAction } from './actions';

export const dynamic = 'force-dynamic';

interface KbEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Knowledge base (T-082): поиск + создание Q&A-записей. */
export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('knowledgeBase'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
  const q = sp.q?.trim() ?? '';

  const res = await apiFetch(`/kb${q ? `?q=${encodeURIComponent(q)}` : ''}`, { headers });
  const entries: KbEntry[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* Поиск */}
      <form method="GET" data-testid="kb-search" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('searchPh')}
          className={`flex-1 ${inputCls}`}
        />
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('search')}
        </button>
        {q && (
          <Link
            href="/knowledge-base"
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            {t('reset')}
          </Link>
        )}
      </form>

      {/* Создание */}
      <form
        action={createKbAction}
        data-testid="kb-create"
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap gap-3">
          <input
            name="question"
            required
            placeholder={t('questionPh')}
            className={`flex-1 ${inputCls}`}
          />
          <input name="category" placeholder={t('category')} className={inputCls} />
        </div>
        <textarea
          name="answer"
          required
          rows={2}
          placeholder={t('answerPh')}
          className={inputCls}
        />
        <button
          type="submit"
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {entries.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="kb-list">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-1 rounded-xl border border-border bg-white p-4 shadow-sm"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-foreground">{e.question}</span>
                {e.category && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-secondary">
                    {e.category}
                  </span>
                )}
              </span>
              <p className="text-sm text-secondary">{e.answer}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
