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

/** Навигационные группы хаба (T-A16). testid go-<slug> сохранены для verify. */
const NAV_GROUPS: Array<{
  group: string;
  items: Array<{ href: string; testid: string; label: string }>;
}> = [
  {
    group: 'overview',
    items: [
      { href: '/dashboard', testid: 'go-dashboard', label: 'dashboard' },
      { href: '/dashboards', testid: 'go-dashboards-charts', label: 'chartDashboards' },
      { href: '/reports', testid: 'go-reports', label: 'reports' },
      { href: '/snapshots', testid: 'go-snapshots', label: 'snapshots' },
      { href: '/trends', testid: 'go-trends', label: 'trends' },
      { href: '/kpi', testid: 'go-kpi', label: 'kpi' },
    ],
  },
  {
    group: 'compliance',
    items: [
      { href: '/frameworks', testid: 'go-frameworks', label: 'frameworks' },
      { href: '/controls', testid: 'go-controls', label: 'controls' },
      { href: '/policies', testid: 'go-policies', label: 'policies' },
      { href: '/commitments', testid: 'go-commitments', label: 'commitments' },
      { href: '/universe', testid: 'go-universe', label: 'universe' },
    ],
  },
  {
    group: 'engagements',
    items: [
      { href: '/engagements', testid: 'go-engagements', label: 'engagements' },
      { href: '/audit-programs', testid: 'go-audit-programs', label: 'auditPrograms' },
      { href: '/working-papers', testid: 'go-working-papers', label: 'workingPapers' },
      { href: '/plans', testid: 'go-plans', label: 'plans' },
      { href: '/allocations', testid: 'go-allocations', label: 'allocations' },
      { href: '/time', testid: 'go-time', label: 'time' },
      { href: '/satisfaction', testid: 'go-satisfaction', label: 'satisfaction' },
    ],
  },
  {
    group: 'risk',
    items: [
      { href: '/risks', testid: 'go-risks', label: 'risks' },
      { href: '/risk-heatmap', testid: 'go-risk-heatmap', label: 'riskHeatmap' },
      { href: '/privacy', testid: 'go-privacy', label: 'privacy' },
    ],
  },
  {
    group: 'security',
    items: [
      { href: '/iam', testid: 'go-iam', label: 'iam' },
      { href: '/access-reviews', testid: 'go-access-reviews', label: 'accessReviews' },
      { href: '/devices', testid: 'go-devices', label: 'devices' },
      { href: '/security-alerts', testid: 'go-security-alerts', label: 'securityAlerts' },
      { href: '/vulnerabilities', testid: 'go-vulnerabilities', label: 'vulnerabilities' },
      { href: '/code-changes', testid: 'go-code-changes', label: 'codeChanges' },
    ],
  },
  {
    group: 'thirdParty',
    items: [
      { href: '/vendors', testid: 'go-vendors', label: 'vendors' },
      { href: '/trust-center', testid: 'go-trust-center', label: 'trustCenter' },
      { href: '/questionnaires', testid: 'go-questionnaires', label: 'questionnaires' },
      { href: '/knowledge-base', testid: 'go-knowledge-base', label: 'knowledgeBase' },
    ],
  },
  {
    group: 'org',
    items: [
      { href: '/personnel', testid: 'go-personnel', label: 'personnel' },
      { href: '/connectors', testid: 'go-connectors', label: 'connectors' },
      { href: '/config', testid: 'go-config', label: 'config' },
      { href: '/field-permissions', testid: 'go-field-permissions', label: 'fieldPermissions' },
      { href: '/api-keys', testid: 'go-api-keys', label: 'apiKeys' },
      { href: '/notifications', testid: 'go-notifications', label: 'notifications' },
      { href: '/migration', testid: 'go-migration', label: 'migration' },
      { href: '/glossary', testid: 'go-glossary', label: 'glossary' },
    ],
  },
];

/** Первая приватная страница / навигационный хаб (T-047, T-A16): без сессии — на /login. */
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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pt-10">
      {/* Профиль */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-primary">{t('title')}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-secondary">
              {t('name')}:{' '}
              <span data-testid="account-name" className="font-medium text-foreground">
                {user.fullName}
              </span>
            </span>
            <span className="text-secondary">
              Email:{' '}
              <span data-testid="account-email" className="font-medium text-foreground">
                {user.email}
              </span>
            </span>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            data-testid="logout"
            className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('signOut')}
          </button>
        </form>
      </section>

      {/* Onboarding */}
      {onboarding && (
        <section
          className="rounded-xl border border-border bg-white p-5 shadow-sm"
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
          <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
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

      {/* Навигация по категориям */}
      {NAV_GROUPS.map(({ group, items }) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-secondary uppercase">
            {t(`nav.${group}`)}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  data-testid={it.testid}
                  className="flex min-h-[3rem] items-center justify-center rounded-xl border border-border bg-white px-4 py-3 text-center text-sm font-medium text-foreground shadow-sm transition-colors duration-150 hover:border-accent hover:bg-accent/5 hover:text-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t(it.label)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
