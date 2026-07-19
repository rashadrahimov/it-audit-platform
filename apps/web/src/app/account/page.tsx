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

/** Счётчик из list-эндпоинта (устойчив к array / {items} / {total}). */
async function countOf(path: string, headers: Record<string, string>): Promise<number | null> {
  try {
    const res = await apiFetch(path, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data?.items)) return data.items.length;
    if (typeof data?.total === 'number') return data.total;
    return null;
  } catch {
    return null;
  }
}

const QUICK: Array<{ href: string; testid: string; label: string; icon: string }> = [
  {
    href: '/engagements',
    testid: 'quick-engagements',
    label: 'engagements',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6L19 8.4V19a2 2 0 01-2 2z',
  },
  {
    href: '/controls',
    testid: 'quick-controls',
    label: 'controls',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    href: '/frameworks',
    testid: 'quick-frameworks',
    label: 'frameworks',
    icon: 'M4 5a2 2 0 012-2h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5z',
  },
  {
    href: '/reports',
    testid: 'quick-reports',
    label: 'reports',
    icon: 'M9 17v-6m3 6V7m3 10v-4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    href: '/risks',
    testid: 'quick-risks',
    label: 'risks',
    icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  },
  {
    href: '/ai-settings',
    testid: 'quick-ai-settings',
    label: 'aiSettings',
    icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
  },
];

function Icon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

/** Домашний дашборд (T-H28 → T-H30 premium): hero + метрики + онбординг + быстрый доступ. */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('account'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [engagements, controls, frameworks, onbRes] = await Promise.all([
    countOf('/engagements', headers),
    countOf('/controls', headers),
    countOf('/frameworks', headers),
    tenantSlug ? apiFetch('/onboarding', { headers }) : Promise.resolve(null),
  ]);
  const onboarding: Onboarding | null = onbRes && onbRes.ok ? await onbRes.json() : null;
  const onbPct = onboarding ? Math.round((onboarding.done / onboarding.total) * 100) : null;

  const stats = [
    {
      label: t('engagements'),
      value: engagements,
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6L19 8.4V19a2 2 0 01-2 2z',
    },
    {
      label: t('controls'),
      value: controls,
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: t('frameworks'),
      value: frameworks,
      icon: 'M4 5a2 2 0 012-2h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5z',
    },
    ...(onbPct !== null
      ? [
          {
            label: t('onboardingTitle'),
            value: `${onbPct}%`,
            icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 md:p-10">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-[#123a5e] p-7 text-on-primary shadow-md md:p-9">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-accent/25 blur-3xl"
        />
        <p className="text-sm font-medium text-white/70">{t('welcome')},</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{user.fullName}</h1>
        {tenantSlug && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {tenantSlug}
          </p>
        )}
      </header>

      {/* Метрики */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow duration-150 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon d={s.icon} className="h-5 w-5" />
            </span>
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {s.value ?? '—'}
              </div>
              <div className="text-xs font-medium text-secondary">{s.label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Onboarding */}
      {onboarding && onbPct !== null && onbPct < 100 && (
        <section
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
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
              className="h-full rounded-full bg-gradient-to-r from-accent to-success transition-all duration-500"
              style={{ width: `${onbPct}%` }}
            />
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {onboarding.steps.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={
                    s.done
                      ? 'flex h-4 w-4 items-center justify-center rounded-full bg-success text-[10px] font-bold text-white'
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
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-wider text-secondary uppercase">
          {t('quickAccess')}
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK.map((q) => (
            <li key={q.href}>
              <Link
                href={q.href}
                data-testid={q.testid}
                className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-on-primary">
                  <Icon d={q.icon} className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-semibold text-foreground group-hover:text-accent">
                  {t(q.label)}
                </span>
                <Icon
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  className="h-4 w-4 text-border transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
