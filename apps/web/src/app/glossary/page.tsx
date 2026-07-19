import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface Term {
  id: string;
  term: string;
  definition: string;
  category: string | null;
  isGlobal: boolean;
}

/** Глоссарий (T-095): справочник терминов, локализованный, сид + кастом. */
export default async function GlossaryPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('glossary'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch(`/glossary?locale=${locale}`, { headers });
  const terms: Term[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {terms.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2" data-testid="glossary">
          {terms.map((term) => (
            <div
              key={term.id}
              className="flex flex-col gap-1 rounded-xl border border-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <dt className="font-semibold text-foreground">{term.term}</dt>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    term.isGlobal ? 'bg-muted text-secondary' : 'bg-accent/10 text-accent'
                  }`}
                >
                  {term.isGlobal ? t('global') : t('custom')}
                </span>
              </div>
              <dd className="text-sm text-secondary">{term.definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
