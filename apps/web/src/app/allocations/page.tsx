import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createAllocationAction } from './actions';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  fullName: string;
  role: string;
  status: string;
}
interface Engagement {
  id: string;
  title: string;
}
interface Utilization {
  membershipId: string;
  allocated: number;
  capacity: number;
  utilizationPct: number | null;
  overallocated: boolean;
}

const DEFAULT_CAPACITY = 160;
const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Аллокации ресурсов (T-102/T-A24): назначение + утилизация команды vs capacity. */
export default async function AllocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ capacity?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('allocations'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const capacityRaw = Number(sp.capacity);
  const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : DEFAULT_CAPACITY;

  const [memRes, engRes] = await Promise.all([
    apiFetch('/memberships', { headers }),
    apiFetch('/engagements', { headers }),
  ]);
  const members: Member[] = memRes.ok ? await memRes.json() : [];
  const engagements: Engagement[] = engRes.ok ? await engRes.json() : [];

  const utils = await Promise.all(
    members.map(async (m) => {
      const uRes = await apiFetch(
        `/allocations/utilization?membershipId=${m.id}&capacity=${capacity}`,
        { headers },
      );
      const util: Utilization | null = uRes.ok ? await uRes.json() : null;
      return { member: m, util };
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

      {/* Создать аллокацию */}
      <form action={createAllocationAction} data-testid="allocation-create" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          {t('member')}
          <select name="membershipId" required defaultValue="" className={inputCls}>
            <option value="" disabled>{t('pickMember')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName} · {m.role}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          {t('engagement')}
          <select name="engagementId" required defaultValue="" className={inputCls}>
            <option value="" disabled>{t('pickEngagement')}</option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('hours')}
          <input name="allocatedHours" type="number" min="1" step="1" required defaultValue="40" className={`w-24 ${inputCls}`} />
        </label>
        <input name="period" placeholder={t('period')} className={`w-28 ${inputCls}`} />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('allocate')}
        </button>
      </form>

      {/* Утилизация команды */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-secondary">{t('utilization')}</h2>
          <form method="GET" data-testid="capacity-form" className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-secondary">
              {t('capacity')}
              <input name="capacity" type="number" min="1" defaultValue={capacity} className={`w-24 ${inputCls}`} />
            </label>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('apply')}
            </button>
          </form>
        </div>

        {members.length === 0 ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-secondary shadow-sm">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="utilization-list">
            {utils.map(({ member, util }) => {
              const pct = util?.utilizationPct ?? 0;
              const over = util?.overallocated ?? false;
              return (
                <li key={member.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{member.fullName}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-secondary">{member.role}</span>
                    </span>
                    <span className={`text-sm font-medium ${over ? 'text-destructive' : 'text-secondary'}`}>
                      {util?.allocated ?? 0} / {capacity} {t('h')} · {pct}%
                      {over && <span className="ml-1">· {t('overallocated')}</span>}
                    </span>
                  </div>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={util?.allocated ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={capacity}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${over ? 'bg-destructive' : 'bg-accent'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
