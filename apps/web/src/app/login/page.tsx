import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { LocaleSwitcher } from '../locale-switcher';
import { getCurrentLocale } from '@/lib/locale';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/account');
  const [t, locale] = await Promise.all([getTranslations('auth'), getCurrentLocale()]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold text-primary">IT Audit Platform</h1>
        <p className="text-sm text-secondary">{t('subtitle')}</p>
      </div>
      <section className="w-full rounded-xl border border-border bg-white p-6 shadow-sm">
        <LoginForm />
      </section>
      <LocaleSwitcher current={locale} />
    </main>
  );
}
