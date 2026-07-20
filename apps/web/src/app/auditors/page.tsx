import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocalized, type I18nText } from '@it-audit/shared';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { InviteAuditorForm } from './invite-auditor-form';
import { setAccessWindowAction, revokeMembershipAction } from './actions';

export const dynamic = 'force-dynamic';

interface Membership {
  id: string;
  fullName: string;
  email: string;
  category: string;
  status: string;
  subsidiaryScope: string[] | null;
  dataAccessFrom: string | null;
  dataAccessUntil: string | null;
  role: string;
}
interface Role {
  id: string;
  nameI18n: I18nText;
}
interface Subsidiary {
  id: string;
  name: string;
}

const CATEGORY_TONE: Record<string, string> = {
  external_auditor: 'bg-sky-100 text-sky-700',
  auditor: 'bg-indigo-100 text-indigo-700',
  respondent: 'bg-slate-100 text-slate-700',
  msp: 'bg-amber-100 text-amber-700',
};
const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  invited: 'bg-amber-100 text-amber-700',
  revoked: 'bg-red-100 text-red-700',
};

const pill = (text: string, tone: string) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{text}</span>
);
const dateVal = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

const btnCls =
  'cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export default async function AuditorsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, locale] = await Promise.all([
    getTranslations('auditors'),
    getActiveTenantSlug(),
    getCurrentLocale(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [mRes, rRes, sRes] = await Promise.all([
    apiFetch('/memberships', { headers }),
    apiFetch(tenantSlug ? `/rbac/roles?tenantSlug=${tenantSlug}` : '/rbac/roles', { headers }),
    apiFetch(`/subsidiaries?locale=${locale}`, { headers }),
  ]);
  const members: Membership[] = mRes.ok ? await mRes.json() : [];
  const roles: Role[] = rRes.ok ? await rRes.json() : [];
  const subsidiaries: Subsidiary[] = sRes.ok ? await sRes.json() : [];

  const subName = new Map(subsidiaries.map((s) => [s.id, s.name]));
  const roleOptions = roles.map((r) => ({ id: r.id, name: resolveLocalized(r.nameI18n, locale) }));
  const externalRole = roles.find((r) => r.nameI18n.en === 'External Auditor');
  const defaultRoleId = externalRole?.id ?? roleOptions[0]?.id ?? '';

  const scopeText = (scope: string[] | null) =>
    scope === null
      ? t('allSubsidiaries')
      : scope.length === 0
        ? t('noSubsidiaries')
        : scope.map((id) => subName.get(id) ?? id).join(', ');

  const externals = members.filter((m) => m.category === 'external_auditor');
  const others = members.filter((m) => m.category !== 'external_auditor');

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-secondary">{t('subtitle')}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-secondary uppercase">
          {t('addAuditor')}
        </h2>
        <InviteAuditorForm
          roles={roleOptions}
          subsidiaries={subsidiaries}
          defaultRoleId={defaultRoleId}
          labels={{
            email: t('email'),
            emailPh: t('emailPh'),
            role: t('role'),
            scope: t('scope'),
            scopeHint: t('scopeHint'),
            add: t('invite'),
            ok: t('invited'),
            error: t('inviteError'),
          }}
        />
      </section>

      <section className="flex flex-col gap-3" data-testid="auditors-external">
        <h2 className="text-sm font-semibold tracking-wide text-secondary uppercase">
          {t('externalAuditors')}
        </h2>
        {externals.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('noExternal')} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {externals.map((m) => (
              <article
                key={m.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">{m.fullName}</span>
                    <span className="text-xs text-secondary">{m.email}</span>
                    <span className="text-xs text-secondary">
                      {m.role} · {scopeText(m.subsidiaryScope)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {pill(t(`st.${m.status}`), STATUS_TONE[m.status] ?? 'bg-muted text-secondary')}
                    {m.status !== 'revoked' && (
                      <form action={revokeMembershipAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="cursor-pointer rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 transition-colors duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {t('revoke')}
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                <form
                  action={setAccessWindowAction}
                  className="flex flex-wrap items-end gap-3 border-t border-border pt-4"
                >
                  <input type="hidden" name="id" value={m.id} />
                  <label className="flex flex-col gap-1 text-xs text-secondary">
                    {t('accessFrom')}
                    <input
                      type="date"
                      name="dataAccessFrom"
                      defaultValue={dateVal(m.dataAccessFrom)}
                      className="rounded-md border border-border px-2 py-1 text-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-secondary">
                    {t('accessUntil')}
                    <input
                      type="date"
                      name="dataAccessUntil"
                      defaultValue={dateVal(m.dataAccessUntil)}
                      className="rounded-md border border-border px-2 py-1 text-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    />
                  </label>
                  <button type="submit" className={btnCls}>
                    {t('saveWindow')}
                  </button>
                  <span className="text-xs text-secondary">{t('windowHint')}</span>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-secondary uppercase">
          {t('roster')}
        </h2>
        {others.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('empty')} />
          </div>
        ) : (
          <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-left text-sm" data-testid="auditors-roster">
              <thead>
                <tr className="border-b border-border text-secondary">
                  <th className="px-4 py-3 font-medium">{t('name')}</th>
                  <th className="px-4 py-3 font-medium">{t('role')}</th>
                  <th className="px-4 py-3 font-medium">{t('category')}</th>
                  <th className="px-4 py-3 font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {others.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{m.fullName}</span>
                      <span className="ml-2 text-xs text-secondary">{m.email}</span>
                    </td>
                    <td className="px-4 py-3 text-secondary">{m.role}</td>
                    <td className="px-4 py-3">
                      {pill(
                        t(`cat.${m.category}`),
                        CATEGORY_TONE[m.category] ?? 'bg-muted text-secondary',
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pill(
                        t(`st.${m.status}`),
                        STATUS_TONE[m.status] ?? 'bg-muted text-secondary',
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </section>
    </main>
  );
}
