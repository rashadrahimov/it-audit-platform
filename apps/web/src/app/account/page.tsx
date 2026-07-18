import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { logoutAction } from '../login/actions';

interface Onboarding {
  steps: Array<{ key: string; done: boolean }>;
  done: number;
  total: number;
}

export const dynamic = 'force-dynamic';

/** Первая приватная страница (T-047): без сессии — на /login. */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('account'), getActiveTenantSlug()]);

  // onboarding-прогресс (T-046); 403 у не-админов — секция просто не показывается
  let onboarding: Onboarding | null = null;
  if (tenantSlug) {
    const res = await apiFetch('/onboarding', { headers: { 'X-Tenant-Slug': tenantSlug } });
    if (res.ok) onboarding = await res.json();
  }

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
        <Link
          href="/frameworks"
          data-testid="go-frameworks"
          className="mb-3 block w-full rounded-md bg-accent px-4 py-2 text-center font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('frameworks')}
        </Link>
        {onboarding && (
          <div
            className="mb-6 rounded-lg border border-border bg-background p-4"
            data-testid="onboarding"
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-primary">{t('onboardingTitle')}</h2>
              <span className="text-xs font-medium text-secondary">
                {onboarding.done}/{onboarding.total}
              </span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${(onboarding.done / onboarding.total) * 100}%` }}
              />
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {onboarding.steps.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={
                      s.done
                        ? 'flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-on-primary'
                        : 'h-4 w-4 rounded-full border border-border'
                    }
                  >
                    {s.done ? '✓' : ''}
                  </span>
                  <span className={s.done ? 'text-secondary line-through' : 'text-foreground'}>
                    {t(`onboarding.${s.key}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link
          href="/dashboard"
          data-testid="go-dashboard"
          className="mb-3 block w-full rounded-md bg-accent px-4 py-2 text-center font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('dashboard')}
        </Link>
        <Link
          href="/engagements"
          data-testid="go-engagements"
          className="mb-3 block w-full rounded-md bg-accent px-4 py-2 text-center font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('engagements')}
        </Link>
        <Link
          href="/controls"
          data-testid="go-controls"
          className="mb-3 block w-full rounded-md bg-accent px-4 py-2 text-center font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('controls')}
        </Link>
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
