import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface FrameworkRow {
  id: string;
  name: string;
  version: string;
  status: string;
  isGlobal: boolean;
}

/** Библиотека стандартов (T-030): первый доменный список в UI. */
export default async function FrameworksPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale] = await Promise.all([getTranslations('frameworks'), getCurrentLocale()]);

  const res = await apiFetch(`/frameworks?locale=${locale}`);
  const frameworks: FrameworkRow[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="frameworks-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('version')}</th>
              <th className="px-4 py-3 font-medium">{t('status')}</th>
              <th className="px-4 py-3 font-medium">{t('origin')}</th>
            </tr>
          </thead>
          <tbody>
            {frameworks.map((fw) => (
              <tr key={fw.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{fw.name}</td>
                <td className="px-4 py-3 text-secondary">{fw.version}</td>
                <td className="px-4 py-3 text-secondary">{t(`statuses.${fw.status}`)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                    {fw.isGlobal ? t('global') : t('tenant')}
                  </span>
                </td>
              </tr>
            ))}
            {frameworks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-secondary">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
