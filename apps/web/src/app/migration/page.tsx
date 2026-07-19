import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { MigrationForm } from './migration-form';

export const dynamic = 'force-dynamic';

/** Импорт чеклист-шаблона клиента (EP-MIGRATE, T-H18): upload → preview/import контролей. */
export default async function MigrationPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const t = await getTranslations('migration');

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

      <p className="text-sm text-secondary">{t('intro')}</p>

      <MigrationForm
        labels={{
          file: t('file'),
          preview: t('preview'),
          import: t('import'),
          parsed: t('parsed'),
          ref: t('ref'),
          domain: t('domain'),
          compliance: t('compliance'),
          risk: t('risk'),
          imported: t('imported'),
          domains: t('domains'),
          controls: t('controls'),
          skipped: t('skipped'),
          errorFile: t('errorFile'),
          errorApi: t('errorApi'),
        }}
      />
    </main>
  );
}
