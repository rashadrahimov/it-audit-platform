import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { LogoMark } from '@/components/logo';
import { MagicConsume } from './magic-consume';

export const dynamic = 'force-dynamic';

/** Callback passwordless-ссылки из письма: /login/magic?token=… → сессия. */
export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getSessionUser()) redirect('/account');
  const { token } = await searchParams;
  const t = await getTranslations('auth');

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-on-primary shadow-sm">
            <LogoMark className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-primary">{t('magicTitle')}</h1>
        </div>

        <div className="w-full rounded-2xl border border-border bg-surface p-6 shadow-md">
          {token ? (
            <MagicConsume token={token} />
          ) : (
            <div className="flex flex-col gap-4" data-testid="magic-error">
              <p role="alert" className="text-sm text-destructive">
                {t('magicInvalid')}
              </p>
              <Link href="/login" className="text-sm font-medium text-accent hover:underline">
                {t('backToLogin')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
