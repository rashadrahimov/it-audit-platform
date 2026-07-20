import { getTranslations } from 'next-intl/server';
import { LogoMark } from '@/components/logo';
import { MagicConsume } from './magic-consume';

export const dynamic = 'force-dynamic';

/** T-V36e: страница погашения magic-link — читает ?token и завершает вход. */
export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [t, sp] = await Promise.all([getTranslations('auth'), searchParams]);
  const token = typeof sp.token === 'string' ? sp.token : '';

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-on-primary shadow-sm">
          <LogoMark className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-primary">{t('magicTitle')}</h1>
        <div className="w-full rounded-2xl border border-border bg-surface p-6 shadow-md">
          <MagicConsume token={token} />
        </div>
      </div>
    </main>
  );
}
