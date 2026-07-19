import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface Hit {
  type: string;
  id: string;
  label: string;
  snippet?: string;
}

/** Куда ведёт хит каждого типа (T-V09; у WP/KB/программ пока нет detail-страниц — на разделы). */
const HREF: Record<string, (id: string) => string> = {
  finding: (id) => `/findings/${id}`,
  control: (id) => `/controls/${id}`,
  working_paper: () => '/working-papers',
  kb_entry: () => '/knowledge-base',
  audit_program: () => '/audit-programs',
};
const TYPE_ORDER = ['finding', 'control', 'working_paper', 'kb_entry', 'audit_program'];

/** Результаты глобального поиска (T-V09 поверх GEN-05 T-094). */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('search'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  if (!tenantSlug) redirect('/account');
  const q = (sp.q ?? '').trim();

  let hits: Hit[] = [];
  if (q) {
    const res = await apiFetch(`/search?q=${encodeURIComponent(q)}`, {
      headers: { 'X-Tenant-Slug': tenantSlug },
    });
    hits = res.ok ? ((await res.json()) as { hits: Hit[] }).hits : [];
  }
  const byType = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byType.get(h.type) ?? [];
    arr.push(h);
    byType.set(h.type, arr);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <h1 className="text-2xl font-bold text-primary">
        {t('title')}
        {q && <span className="ml-2 font-normal text-secondary">«{q}»</span>}
      </h1>
      {!q ? (
        <p className="text-sm text-secondary">{t('hint')}</p>
      ) : hits.length === 0 ? (
        <EmptyState text={t('empty')} />
      ) : (
        <div className="flex flex-col gap-5" data-testid="search-results">
          {TYPE_ORDER.filter((type) => byType.has(type)).map((type) => (
            <section key={type} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-primary">
                {t(`types.${type}`)}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary tabular-nums">
                  {byType.get(type)!.length}
                </span>
              </h2>
              <ul className="flex flex-col gap-1.5">
                {byType.get(type)!.map((h) => (
                  <li key={h.id} className="text-sm">
                    <Link
                      href={HREF[h.type]?.(h.id) ?? '/account'}
                      className="font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {h.label}
                    </Link>
                    {h.snippet && <span className="ml-2 text-secondary">{h.snippet}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
