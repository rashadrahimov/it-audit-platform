import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocalized, type I18nText } from '@it-audit/shared';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { deleteFieldPermAction, upsertFieldPermAction } from './actions';

export const dynamic = 'force-dynamic';

interface Role {
  id: string;
  tenantId: string | null;
  nameI18n: I18nText;
}
type Level = 'hidden' | 'view' | 'edit';
interface FieldPerm {
  id: string;
  roleId: string;
  entityType: string;
  field: string;
  level: Level;
}

const LEVELS: Level[] = ['hidden', 'view', 'edit'];
const LEVEL_TONE: Record<Level, string> = {
  hidden: 'bg-red-100 text-red-700',
  view: 'bg-amber-100 text-amber-700',
  edit: 'bg-emerald-100 text-emerald-700',
};
const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Управление field-level правами (SEC-04, T-H08, ADR-0020): роль тенанта × сущность × поле → level. */
export default async function FieldPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ roleId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, locale, sp] = await Promise.all([
    getTranslations('fieldPermissions'),
    getActiveTenantSlug(),
    getCurrentLocale(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const rolesRes = await apiFetch(`/rbac/roles${tenantSlug ? `?tenantSlug=${tenantSlug}` : ''}`, {
    headers,
  });
  const allRoles: Role[] = rolesRes.ok ? await rolesRes.json() : [];
  // редактируемы только роли тенанта (глобальные пресеты настраивает seed)
  const roles = allRoles.filter((r) => r.tenantId !== null);
  const roleId = sp.roleId && roles.some((r) => r.id === sp.roleId) ? sp.roleId : roles[0]?.id;

  let perms: FieldPerm[] = [];
  if (roleId) {
    const res = await apiFetch(`/field-permissions?roleId=${encodeURIComponent(roleId)}`, {
      headers,
    });
    perms = res.ok ? await res.json() : [];
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <p className="text-sm text-secondary">{t('intro')}</p>

      {roles.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('noRoles')}
        </section>
      ) : (
        <>
          {/* Выбор роли */}
          <form
            method="GET"
            data-testid="fp-role-select"
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
              {t('role')}
              <select name="roleId" defaultValue={roleId} className={inputCls}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {resolveLocalized(r.nameI18n, locale)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('show')}
            </button>
          </form>

          {/* Создание правила */}
          <form
            action={upsertFieldPermAction}
            data-testid="fp-create"
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <input type="hidden" name="roleId" value={roleId} />
            <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
              {t('entity')}
              <input name="entityType" required placeholder="finding" className={inputCls} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
              {t('field')}
              <input name="field" required placeholder="recommendation" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-secondary">
              {t('level')}
              <select name="level" defaultValue="hidden" className={inputCls}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`levels.${l}`)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('add')}
            </button>
          </form>

          {perms.length === 0 ? (
            <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
              {t('empty')}
            </section>
          ) : (
            <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <table className="w-full text-left text-sm" data-testid="fp-table">
                <thead>
                  <tr className="border-b border-border text-secondary">
                    <th className="px-4 py-3 font-medium">{t('entity')}</th>
                    <th className="px-4 py-3 font-medium">{t('field')}</th>
                    <th className="px-4 py-3 font-medium">{t('level')}</th>
                    <th className="px-4 py-3 font-medium">—</th>
                  </tr>
                </thead>
                <tbody>
                  {perms.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{p.entityType}</td>
                      <td className="px-4 py-3 font-mono text-xs text-secondary">{p.field}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_TONE[p.level]}`}
                        >
                          {t(`levels.${p.level}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <form action={deleteFieldPermAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {t('remove')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </main>
  );
}
