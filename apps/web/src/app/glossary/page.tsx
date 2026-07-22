import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import {
  createGlossaryTermAction,
  deleteGlossaryTermAction,
  updateGlossaryTermAction,
} from './actions';

export const dynamic = 'force-dynamic';

interface Term {
  id: string;
  term: string;
  definition: string;
  definitionI18n: { en: string; ru: string; az: string };
  category: string | null;
  isGlobal: boolean;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const buttonCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Глоссарий (T-095/T-H128): локализованный справочник с CRUD кастомных терминов. */
export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('glossary'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const { q = '' } = await searchParams;
  const query = new URLSearchParams({ locale });
  if (q.trim()) query.set('q', q.trim());
  const res = await apiFetch(`/glossary?${query.toString()}`, { headers });
  const terms: Term[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('search')}
          aria-label={t('search')}
          className={`min-w-0 flex-1 ${inputCls}`}
        />
        <button className={buttonCls}>{t('searchButton')}</button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('create')}</h2>
        <form
          action={createGlossaryTermAction}
          className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm sm:grid-cols-2"
          data-testid="glossary-create"
        >
          <input name="term" required placeholder={t('term')} className={inputCls} />
          <input name="category" placeholder={t('category')} className={inputCls} />
          {(['En', 'Ru', 'Az'] as const).map((language) => (
            <textarea
              key={language}
              name={`definition${language}`}
              required={language === 'En'}
              placeholder={t(`definition${language}`)}
              className={`${inputCls} min-h-20`}
            />
          ))}
          <button className={`${buttonCls} sm:justify-self-start`}>{t('add')}</button>
        </form>
      </section>

      {terms.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="glossary">
          {terms.map((term) => (
            <article
              key={term.id}
              className="rounded-xl border border-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-foreground">{term.term}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    term.isGlobal ? 'bg-muted text-secondary' : 'bg-accent/10 text-accent'
                  }`}
                >
                  {term.isGlobal ? t('global') : t('custom')}
                </span>
              </div>
              <p className="mt-1 text-sm text-secondary">{term.definition}</p>
              {term.category && <p className="mt-1 text-xs text-secondary">{term.category}</p>}
              {!term.isGlobal && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-accent">
                    {t('edit')}
                  </summary>
                  <form
                    action={updateGlossaryTermAction.bind(null, term.id)}
                    className="mt-3 grid gap-2"
                  >
                    <input name="term" required defaultValue={term.term} className={inputCls} />
                    <input
                      name="category"
                      defaultValue={term.category ?? ''}
                      placeholder={t('category')}
                      className={inputCls}
                    />
                    {(['En', 'Ru', 'Az'] as const).map((language) => (
                      <textarea
                        key={language}
                        name={`definition${language}`}
                        required={language === 'En'}
                        defaultValue={
                          term.definitionI18n[language.toLowerCase() as 'en' | 'ru' | 'az']
                        }
                        placeholder={t(`definition${language}`)}
                        className={`${inputCls} min-h-20`}
                      />
                    ))}
                    <button className={buttonCls}>{t('save')}</button>
                  </form>
                  <form action={deleteGlossaryTermAction.bind(null, term.id)} className="mt-2">
                    <button className="text-sm font-medium text-red-700 hover:underline">
                      {t('delete')}
                    </button>
                  </form>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
