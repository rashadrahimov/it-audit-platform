import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { changeMemberRoleAction } from './actions';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  fullName: string;
  email: string;
  category: string;
  status: string;
  role: string;
}
interface RoleRow {
  id: string;
  tenantId: string | null;
  nameI18n: Record<string, string>;
}

/** Settings→User permissions (T-V05, B14): участники + смена роли + категории. */
export default async function MembersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('members'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const [mRes, rRes] = await Promise.all([
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch(`/rbac/roles?tenantSlug=${tenantSlug}`),
  ]);
  const members: Member[] = mRes.ok ? await mRes.json() : [];
  const roles: RoleRow[] = rRes.ok ? await rRes.json() : [];
  const roleName = (r: RoleRow) => r.nameI18n[locale] ?? r.nameI18n.en ?? r.id;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="members-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('colName')}</th>
              <th className="px-4 py-3 font-medium">{t('colEmail')}</th>
              <th className="px-4 py-3 font-medium">{t('colCategory')}</th>
              <th className="px-4 py-3 font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('colRole')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{m.fullName}</td>
                <td className="px-4 py-3 text-secondary">{m.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                    {['auditor', 'end_user', 'msp'].includes(m.category)
                      ? t(`categories.${m.category}`)
                      : m.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-secondary">{m.status}</td>
                <td className="px-4 py-3">
                  {roles.length > 0 ? (
                    <form
                      action={changeMemberRoleAction.bind(null, m.id)}
                      className="flex items-center gap-1.5"
                    >
                      <select
                        name="roleId"
                        defaultValue={roles.find((r) => roleName(r) === m.role)?.id ?? ''}
                        className="rounded-md border border-border bg-white px-1.5 py-1 text-xs text-foreground"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {roleName(r)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                      >
                        {t('roleSave')}
                      </button>
                    </form>
                  ) : (
                    m.role
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
