import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import {
  createDepartmentAction,
  deleteDepartmentAction,
  setPersonnelStatusAction,
} from './actions';

export const dynamic = 'force-dynamic';

interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  unit: string | null;
  position: string | null;
  employmentStatus: 'active' | 'onboarding' | 'offboarded';
  fromConnector: boolean;
  taskSummary: { total: number; open: number; overdue: number };
}
interface Dept {
  id: string;
  nameI18n: { en: string; az?: string; ru?: string };
  people: number;
}

const STATUS_TONE: Record<Profile['employmentStatus'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  onboarding: 'bg-emerald-100 text-emerald-700',
  offboarded: 'bg-muted text-secondary',
};
const STATUSES = ['active', 'onboarding', 'offboarded'] as const;
const smallBtn =
  'rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Персонал (T-069 → T-V26): статус занятости + task-статус + Groups (департаменты). */
export default async function PersonnelPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('personnel'),
    getLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [res, deptRes] = await Promise.all([
    apiFetch('/personnel', { headers }),
    apiFetch('/personnel/departments', { headers }),
  ]);
  const people: Profile[] = res.ok ? await res.json() : [];
  const departments: Dept[] = deptRes.ok ? await deptRes.json() : [];
  const deptName = (d: Dept) =>
    (d.nameI18n as Record<string, string | undefined>)[locale] ?? d.nameI18n.en;

  const taskStatus = (s: Profile['taskSummary'] | undefined) => {
    s ??= { total: 0, open: 0, overdue: 0 };
    if (s.total === 0) return <span className="text-secondary">{t('noTasks')}</span>;
    if (s.overdue > 0)
      return (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 tabular-nums">
          {t('nOverdue', { n: s.overdue })}
        </span>
      );
    if (s.open > 0)
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 tabular-nums">
          {t('nOpen', { n: s.open })}
        </span>
      );
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        {t('complete')}
      </span>
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {people.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="personnel-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('name')}</th>
                <th className="px-4 py-3 font-medium">{t('statusCol')}</th>
                <th className="px-4 py-3 font-medium">{t('taskStatus')}</th>
                <th className="px-4 py-3 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{p.fullName}</div>
                    {(p.position || p.unit || p.email) && (
                      <div className="text-xs text-secondary">
                        {[p.position, p.unit, p.email].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[p.employmentStatus]}`}
                    >
                      {t(`status.${p.employmentStatus}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3" data-testid="personnel-task-status">
                    {taskStatus(p.taskSummary)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {STATUSES.filter((s) => s !== p.employmentStatus).map((s) => (
                        <form key={s} action={setPersonnelStatusAction.bind(null, p.id, s)}>
                          <button
                            type="submit"
                            data-testid={`personnel-to-${s}`}
                            className={smallBtn}
                          >
                            {t(`to.${s}`)}
                          </button>
                        </form>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="personnel-groups"
      >
        <h2 className="text-sm font-semibold text-primary">{t('groups')}</h2>
        {departments.length === 0 ? (
          <p className="text-sm text-secondary">{t('noGroups')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {departments.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-foreground">{deptName(d)}</span>
                  <span className="ml-2 text-xs text-secondary tabular-nums">
                    {t('people', { n: d.people })}
                  </span>
                </span>
                <form action={deleteDepartmentAction.bind(null, d.id)}>
                  <button
                    type="submit"
                    data-testid="dept-delete"
                    aria-label={t('deleteGroup')}
                    className={smallBtn}
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form
          action={createDepartmentAction}
          className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
          data-testid="dept-create"
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('newGroup')}</span>
            <input
              name="name"
              required
              placeholder={t('groupPh')}
              className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
          <button
            type="submit"
            data-testid="dept-add"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('addGroup')}
          </button>
        </form>
      </section>
    </main>
  );
}
