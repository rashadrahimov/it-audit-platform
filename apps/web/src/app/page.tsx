import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { fetchApiHealth } from '@/lib/api';
import { getCurrentLocale } from '@/lib/locale';
import { LocaleSwitcher } from './locale-switcher';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [health, t, locale] = await Promise.all([
    fetchApiHealth(),
    getTranslations('home'),
    getCurrentLocale(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-neutral-500">{t('skeleton')}</p>
      <p data-testid="api-status" className={health ? 'text-green-700' : 'text-red-700'}>
        {health ? t('apiOk', health) : t('apiDown')}
      </p>
      <Link
        href="/login"
        data-testid="go-login"
        className="rounded-md bg-accent px-5 py-2.5 font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('signIn')}
      </Link>
      <LocaleSwitcher current={locale} />
    </main>
  );
}
