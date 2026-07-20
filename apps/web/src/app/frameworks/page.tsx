import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { activateFrameworkAction, deactivateFrameworkAction } from './actions';

export const dynamic = 'force-dynamic';

interface FrameworkRow {
  id: string;
  name: string;
  version: string;
  status: string;
  domain: string | null;
  isGlobal: boolean;
  isActive: boolean | null;
}

const DOMAINS = ['security', 'privacy', 'industry', 'custom'];
const DOMAIN_TONE: Record<string, string> = {
  security: 'bg-sky-100 text-sky-700',
  privacy: 'bg-violet-100 text-violet-700',
  industry: 'bg-amber-100 text-amber-700',
  custom: 'bg-muted text-secondary',
};

/** Каталог стандартов (T-030 → T-V25): Active/Available, активация per-tenant. */
export default async function FrameworksPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('frameworks'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  const qs = tenantSlug ? `&tenantSlug=${tenantSlug}` : '';
  const res = await apiFetch(`/frameworks?locale=${locale}${qs}`);
  const frameworks: FrameworkRow[] = res.ok ? await res.json() : [];
  const active = frameworks.filter((fw) => fw.isActive === true);
  const available = frameworks.filter((fw) => fw.isActive !== true);

  const domainChip = (domain: string | null) =>
    domain && DOMAINS.includes(domain) ? (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOMAIN_TONE[domain] ?? 'bg-muted text-secondary'}`}
      >
        {t(`dom.${domain}`)}
      </span>
    ) : null;

  const table = (rows: FrameworkRow[], mode: 'active' | 'available', testid: string) => (
    <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
      <table className="w-full text-left text-sm" data-testid={testid}>
        <thead>
          <tr className="border-b border-border text-secondary">
            <th className="px-4 py-3 font-medium">{t('name')}</th>
            <th className="px-4 py-3 font-medium">{t('version')}</th>
            <th className="px-4 py-3 font-medium">{t('domain')}</th>
            <th className="px-4 py-3 font-medium">{t('origin')}</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((fw) => (
            <tr key={fw.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/frameworks/${fw.id}`}
                  className="font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                >
                  {fw.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-secondary">{fw.version}</td>
              <td className="px-4 py-3">{domainChip(fw.domain) ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                  {fw.isGlobal ? t('global') : t('tenant')}
                </span>
              </td>
              <td className="px-4 py-3">
                {mode === 'available' ? (
                  <form action={activateFrameworkAction.bind(null, fw.id)}>
                    <button
                      type="submit"
                      data-testid="fw-activate"
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('addFramework')}
                    </button>
                  </form>
                ) : (
                  <form action={deactivateFrameworkAction.bind(null, fw.id)}>
                    <button
                      type="submit"
                      data-testid="fw-deactivate"
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('remove')}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-0">
                <EmptyState size="sm" text={mode === 'active' ? t('noActive') : t('empty')} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-secondary">{t('active')}</h2>
        {table(active, 'active', 'frameworks-active')}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-secondary">{t('available')}</h2>
        {table(available, 'available', 'frameworks-available')}
      </div>
    </main>
  );
}
