import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { LogoMark } from '@/components/logo';
import { SsoForm } from './sso-form';

export const dynamic = 'force-dynamic';

/** Home-realm discovery (V49, ADR-0021): рабочий e-mail → SSO тенанта или пароль. */
export default async function SsoLoginPage() {
  if (await getSessionUser()) redirect('/account');
  const t = await getTranslations('auth');

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-on-primary shadow-sm">
            <LogoMark className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-primary">{t('ssoTitle')}</h1>
        </div>

        <div className="w-full rounded-2xl border border-border bg-surface p-6 shadow-md">
          <SsoForm />
        </div>
      </div>
    </main>
  );
}
