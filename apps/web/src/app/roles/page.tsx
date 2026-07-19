import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { createRoleAction, setRoleCellAction } from './actions';

export const dynamic = 'force-dynamic';

interface RoleRow {
  id: string;
  tenantId: string | null;
  nameI18n: Record<string, string>;
  isSystem: boolean;
  matrix: Array<{ resource: string; action: string; level: 'none' | 'view' | 'edit' }>;
}
interface Perm {
  id: string;
  resource: string;
  action: string;
}

const LEVEL_TONE: Record<string, string> = {
  edit: 'bg-emerald-100 text-emerald-700',
  view: 'bg-amber-100 text-amber-700',
  none: 'bg-muted text-secondary',
};

/** Settings→Roles (T-V05, B14): пресеты + кастомные роли, матрица действие×роль. */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('roles'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  if (!tenantSlug) redirect('/account');

  const [rolesRes, permsRes] = await Promise.all([
    apiFetch(`/rbac/roles?tenantSlug=${tenantSlug}`),
    apiFetch('/rbac/permissions'),
  ]);
  const roles: RoleRow[] = rolesRes.ok ? await rolesRes.json() : [];
  const perms: Perm[] = permsRes.ok ? await permsRes.json() : [];

  const resources = [...new Set(perms.map((p) => p.resource))].sort();
  const actions = [...new Set(perms.map((p) => p.action))].sort();
  const name = (r: RoleRow) => r.nameI18n[locale] ?? r.nameI18n.en ?? r.id;

  const selected = roles.find((r) => r.id === sp.role) ?? roles[0];
  const editable = selected && selected.tenantId !== null && !selected.isSystem;
  const cell = (resource: string, action: string) =>
    selected?.matrix.find((c) => c.resource === resource && c.action === action)?.level ?? 'none';

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <div className="flex flex-wrap gap-1.5" data-testid="roles-list">
        {roles.map((r) => (
          <Link
            key={r.id}
            href={`/roles?role=${r.id}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150 ${
              selected?.id === r.id
                ? 'bg-accent text-on-primary'
                : 'bg-muted text-secondary hover:bg-border'
            }`}
          >
            {name(r)}
            {r.tenantId === null && <span className="ml-1 text-xs opacity-70">{t('preset')}</span>}
          </Link>
        ))}
      </div>

      <form
        action={createRoleAction}
        data-testid="role-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('createEn')}</span>
          <input
            name="nameEn"
            required
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">RU</span>
          <input
            name="nameRu"
            className="w-32 rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">AZ</span>
          <input
            name="nameAz"
            className="w-32 rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('createBtn')}
        </button>
      </form>

      {selected && (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="role-matrix">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">
                  {name(selected)}
                  {!editable && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {t('readonly')}
                    </span>
                  )}
                </th>
                {actions.map((a) => (
                  <th key={a} className="px-3 py-3 text-center font-medium">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((res) => (
                <tr key={res} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-foreground">{res}</td>
                  {actions.map((a) => {
                    const has = perms.some((p) => p.resource === res && p.action === a);
                    const lv = cell(res, a);
                    return (
                      <td key={a} className="px-3 py-2.5 text-center">
                        {has ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_TONE[lv]}`}
                          >
                            {t(`levels.${lv}`)}
                          </span>
                        ) : (
                          <span className="text-border">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selected && editable && (
        <form
          action={setRoleCellAction.bind(null, selected.id)}
          data-testid="role-cell-edit"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <span className="text-sm font-medium text-secondary">{t('cellEdit')}:</span>
          <select
            name="resource"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            {resources.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            name="action"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            name="level"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            {(['none', 'view', 'edit'] as const).map((l) => (
              <option key={l} value={l}>
                {t(`levels.${l}`)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('cellApply')}
          </button>
        </form>
      )}
    </main>
  );
}
