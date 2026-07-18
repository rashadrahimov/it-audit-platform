import { getLocale, getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, localeSchema } from '@it-audit/shared';
import { fetchApiHealth } from '@/lib/api';
import { LocaleSwitcher } from './locale-switcher';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [health, t, rawLocale] = await Promise.all([
    fetchApiHealth(),
    getTranslations('home'),
    getLocale(),
  ]);
  const parsed = localeSchema.safeParse(rawLocale);
  const locale = parsed.success ? parsed.data : DEFAULT_LOCALE;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-neutral-500">{t('skeleton')}</p>
      <p data-testid="api-status" className={health ? 'text-green-700' : 'text-red-700'}>
        {health ? t('apiOk', health) : t('apiDown')}
      </p>
      <LocaleSwitcher current={locale} />
    </main>
  );
}
