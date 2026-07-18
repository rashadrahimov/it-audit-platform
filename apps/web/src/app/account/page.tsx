import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { logoutAction } from '../login/actions';

export const dynamic = 'force-dynamic';

/** Первая приватная страница (T-047): без сессии — на /login. */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const t = await getTranslations('account');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <section className="w-full rounded-xl border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-bold text-primary">{t('title')}</h1>
        <dl className="mb-6 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">{t('name')}</dt>
            <dd data-testid="account-name" className="font-medium text-foreground">
              {user.fullName}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Email</dt>
            <dd data-testid="account-email" className="font-medium text-foreground">
              {user.email}
            </dd>
          </div>
        </dl>
        <form action={logoutAction}>
          <button
            type="submit"
            data-testid="logout"
            className="w-full cursor-pointer rounded-md border border-border px-4 py-2 font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('signOut')}
          </button>
        </form>
      </section>
    </main>
  );
}
