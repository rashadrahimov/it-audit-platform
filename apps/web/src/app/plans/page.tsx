import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface PlanRow {
  id: string;
  name: string;
  year: number | null;
  status: string;
}
interface Capacity {
  capacity: number | null;
  planned: number;
  remaining: number | null;
  overallocated: boolean;
}

/** Годовые планы аудита (T-100/101): загрузка capacity с индикатором перегрузки. */
export default async function PlansPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('plans'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/plans', { headers });
  const plans: PlanRow[] = res.ok ? await res.json() : [];

  const withCapacity = await Promise.all(
    plans.map(async (p) => {
      const cRes = await apiFetch(`/plans/${p.id}/capacity`, { headers });
      const capacity: Capacity | null = cRes.ok ? await cRes.json() : null;
      return { plan: p, capacity };
    }),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      {plans.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="plans-list">
          {withCapacity.map(({ plan, capacity }) => {
            const cap = capacity?.capacity ?? null;
            const planned = capacity?.planned ?? 0;
            const over = capacity?.overallocated ?? false;
            const pct = cap && cap > 0 ? Math.min((planned / cap) * 100, 100) : 0;
            return (
              <li
                key={plan.id}
                className="rounded-xl border border-border bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{plan.name}</span>
                    {plan.year && (
                      <span className="text-sm text-secondary">· {plan.year}</span>
                    )}
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                    {t(`status.${plan.status}`)}
                  </span>
                </div>

                {cap !== null && (
                  <div className="mt-4">
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="text-secondary">
                        {t('planned')}: <span className="font-medium text-foreground">{planned}</span>
                        {' / '}
                        {t('capacity')}: <span className="font-medium text-foreground">{cap}</span> {t('hours')}
                      </span>
                      {over ? (
                        <span className="text-sm font-medium text-destructive">
                          {t('overallocated')}
                        </span>
                      ) : (
                        <span className="text-sm text-secondary">
                          {t('remaining')}: {capacity?.remaining} {t('hours')}
                        </span>
                      )}
                    </div>
                    <div
                      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={planned}
                      aria-valuemin={0}
                      aria-valuemax={cap}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${over ? 'bg-destructive' : 'bg-accent'}`}
                        style={{ width: `${over ? 100 : pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
