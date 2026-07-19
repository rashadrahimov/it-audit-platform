import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocalized, type I18nText } from '@it-audit/shared';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { addPlanItemAction, createPlanAction } from './actions';

export const dynamic = 'force-dynamic';

interface PlanItem {
  id: string;
  auditableEntityId: string;
  priorityScore: number | null;
  plannedHours: number | null;
}
interface PlanDetail {
  id: string;
  name: string;
  year: number | null;
  status: string;
  items: PlanItem[];
}
interface Capacity {
  capacity: number | null;
  planned: number;
  remaining: number | null;
  overallocated: boolean;
}
interface UniverseNode {
  id: string;
  kind: string;
  nameI18n: I18nText;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Годовые планы аудита (T-100/101): создание, items из universe, capacity с индикатором перегрузки. */
export default async function PlansPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, locale] = await Promise.all([
    getTranslations('plans'),
    getActiveTenantSlug(),
    getCurrentLocale(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [listRes, uniRes] = await Promise.all([
    apiFetch('/plans', { headers }),
    apiFetch('/universe', { headers }),
  ]);
  const planRows: { id: string }[] = listRes.ok ? await listRes.json() : [];
  const universe: UniverseNode[] = uniRes.ok ? await uniRes.json() : [];
  const nodeName = (id: string) => {
    const n = universe.find((u) => u.id === id);
    return n ? resolveLocalized(n.nameI18n, locale) : id.slice(0, 8);
  };

  const plans = await Promise.all(
    planRows.map(async (p) => {
      const [dRes, cRes] = await Promise.all([
        apiFetch(`/plans/${p.id}`, { headers }),
        apiFetch(`/plans/${p.id}/capacity`, { headers }),
      ]);
      const detail: PlanDetail | null = dRes.ok ? await dRes.json() : null;
      const capacity: Capacity | null = cRes.ok ? await cRes.json() : null;
      return { detail, capacity };
    }),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* Создание плана */}
      <form
        action={createPlanAction}
        data-testid="plan-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <input name="name" required placeholder={t('namePh')} className={`flex-1 ${inputCls}`} />
        <input name="year" type="number" placeholder={t('year')} className={`w-24 ${inputCls}`} />
        <input
          name="capacityHours"
          type="number"
          min="0"
          placeholder={t('capacity')}
          className={`w-28 ${inputCls}`}
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {plans.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="plans-list">
          {plans.map(({ detail, capacity }) => {
            if (!detail) return null;
            const cap = capacity?.capacity ?? null;
            const planned = capacity?.planned ?? 0;
            const over = capacity?.overallocated ?? false;
            const pct = cap && cap > 0 ? Math.min((planned / cap) * 100, 100) : 0;
            return (
              <li
                key={detail.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{detail.name}</span>
                    {detail.year && <span className="text-sm text-secondary">· {detail.year}</span>}
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                    {t(`status.${detail.status}`)}
                  </span>
                </div>

                {cap !== null && (
                  <div>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="text-secondary">
                        {t('planned')}:{' '}
                        <span className="font-medium text-foreground">{planned}</span>
                        {' / '}
                        {t('capacity')}: <span className="font-medium text-foreground">{cap}</span>{' '}
                        {t('hours')}
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
                      aria-valuemax={cap ?? undefined}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${over ? 'bg-destructive' : 'bg-accent'}`}
                        style={{ width: `${over ? 100 : pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Items */}
                {detail.items.length > 0 && (
                  <ul className="flex flex-col gap-1" data-testid="plan-items">
                    {detail.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-sm"
                      >
                        <span className="text-foreground">{nodeName(it.auditableEntityId)}</span>
                        <span className="flex items-center gap-3 text-xs text-secondary">
                          {it.priorityScore !== null && (
                            <span className="rounded-full bg-white px-2 py-0.5">
                              {t('priority')}: {it.priorityScore}
                            </span>
                          )}
                          <span>
                            {it.plannedHours ?? 0} {t('hours')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Добавить item */}
                <form action={addPlanItemAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={detail.id} />
                  <select
                    name="auditableEntityId"
                    required
                    defaultValue=""
                    className={`flex-1 ${inputCls} py-1.5 text-xs`}
                  >
                    <option value="" disabled>
                      {t('pickEntity')}
                    </option>
                    {universe.map((u) => (
                      <option key={u.id} value={u.id}>
                        {resolveLocalized(u.nameI18n, locale)} ({u.kind})
                      </option>
                    ))}
                  </select>
                  <input
                    name="plannedHours"
                    type="number"
                    min="0"
                    placeholder={t('hours')}
                    className={`w-20 ${inputCls} py-1.5 text-xs`}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t('addItem')}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
