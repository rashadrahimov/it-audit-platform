import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

interface Onboarding {
  steps: Array<{ key: string; done: boolean }>;
  done: number;
  total: number;
}

export const dynamic = 'force-dynamic';

/** Кураторский быстрый доступ (полная навигация — в сайдбаре). */
const QUICK: Array<{ href: string; testid: string; label: string }> = [
  { href: '/engagements', testid: 'quick-engagements', label: 'engagements' },
  { href: '/controls', testid: 'quick-controls', label: 'controls' },
  { href: '/frameworks', testid: 'quick-frameworks', label: 'frameworks' },
  { href: '/reports', testid: 'quick-reports', label: 'reports' },
  { href: '/risks', testid: 'quick-risks', label: 'risks' },
  { href: '/ai-settings', testid: 'quick-ai-settings', label: 'aiSettings' },
];

/** Домашний дашборд (T-047 → T-H28): приветствие + онбординг + быстрый доступ. */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('account'), getActiveTenantSlug()]);

  let onboarding: Onboarding | null = null;
  if (tenantSlug) {
    const res = await apiFetch('/onboarding', { headers: { 'X-Tenant-Slug': tenantSlug } });
    if (res.ok) onboarding = await res.json();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
      {/* Приветствие */}
      <header className="flex flex-col gap-1">
        <p className="text-sm text-secondary">{t('welcome')},</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{user.fullName}</h1>
      </header>

      {/* Onboarding */}
      {onboarding && (
        <section
          className="rounded-2xl border border-border bg-white p-6 shadow-sm"
          data-testid="onboarding"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t('onboardingTitle')}</h2>
            <span className="text-xs font-semibold text-secondary">
              {onboarding.done}/{onboarding.total}
            </span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${(onboarding.done / onboarding.total) * 100}%` }}
            />
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
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
        </section>
      )}

      {/* Быстрый доступ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-secondary uppercase">
          {t('quickAccess')}
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK.map((q) => (
            <li key={q.href}>
              <Link
                href={q.href}
                data-testid={q.testid}
                className="group flex items-center justify-between rounded-xl border border-border bg-white px-4 py-4 shadow-sm transition-all duration-150 hover:border-accent hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="text-sm font-semibold text-foreground group-hover:text-accent">
                  {t(q.label)}
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-border transition-colors group-hover:text-accent"
                >
                  <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
