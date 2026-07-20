import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { CommentsSection } from '@/components/comments-section';
import { ManageAccessSection, type AclGrantRow } from '@/components/manage-access-section';
import { updateControlAction } from '../actions';

export const dynamic = 'force-dynamic';

interface ControlTest {
  id: string;
  title: string;
  kind: string;
  status: string;
  slaStatus: string;
  dueDate: string | null;
  owner: string | null;
}

interface ControlDetail {
  id: string;
  ref: string;
  domain: { code: string; name: string } | null;
  objective: string;
  question: string;
  guidance: string | null;
  note: string | null;
  status: string;
  isGlobal: boolean;
  originControlId: string | null;
  ownerMembershipId: string | null;
  ownerDetail: { fullName: string; email: string } | null;
  standards: Array<{ framework: string; version: string; requirement: string }>;
  history: Array<{ action: string; actor: string | null; at: string }>;
  comments: Array<{ author: string; body: string; at: string }>;
}
interface Member {
  id: string;
  fullName: string;
}

const CTRL_STATUSES = ['active', 'inactive', 'retired'] as const;
const inputCls =
  'rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide text-secondary uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Карточка контроля (T-032, drawer-паттерн Vanta): все поля + history + comments. */
export default async function ControlDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('controlDetail'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  const query = new URLSearchParams({ locale });
  if (tenantSlug) query.set('tenantSlug', tenantSlug);
  const res = await apiFetch(`/controls/${id}?${query}`);
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) throw new Error(`API /controls/${id}: ${res.status}`);
  const control: ControlDetail = await res.json();

  // тесты контроля (T-033) + участники для owner-формы + ACL-гранты: под тенант-контекстом
  let tests: ControlTest[] = [];
  let members: Member[] = [];
  let aclGrants: AclGrantRow[] = [];
  if (tenantSlug) {
    const [tRes, mRes, aclRes] = await Promise.all([
      apiFetch(`/tests?controlId=${id}&locale=${locale}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
      apiFetch(`/memberships?locale=${locale}`, { headers: { 'X-Tenant-Slug': tenantSlug } }),
      apiFetch(`/entity-acl?entityType=control&entityId=${id}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
    ]);
    if (tRes.ok) tests = await tRes.json();
    if (mRes.ok) members = await mRes.json();
    if (aclRes.ok) aclGrants = await aclRes.json();
  }

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">
          {control.ref}
          <span className="ml-3 rounded-full bg-muted px-2.5 py-0.5 align-middle text-xs font-medium text-secondary">
            {control.isGlobal ? t('global') : t('adapted')}
          </span>
        </h1>
        <Link
          href="/controls"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('back')}
        </Link>
      </div>

      <section
        className="rounded-xl border border-border bg-white p-6 shadow-sm"
        data-testid="control-detail"
      >
        <dl className="flex flex-col gap-4">
          <Field label={t('domain')}>{control.domain?.name ?? '—'}</Field>
          <Field label={t('objective')}>{control.objective}</Field>
          <Field label={t('question')}>{control.question}</Field>
          <Field label={t('guidance')}>{control.guidance ?? '—'}</Field>
          <Field label={t('owner')}>
            {control.ownerDetail
              ? `${control.ownerDetail.fullName} (${control.ownerDetail.email})`
              : '—'}
          </Field>
          {control.note && <Field label={t('note')}>{control.note}</Field>}
          <Field label={t('standards')}>
            {control.standards.length === 0 ? (
              '—'
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {control.standards.map((s) => (
                  <span
                    key={`${s.framework}-${s.requirement}`}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-secondary"
                  >
                    {s.framework} {s.requirement}
                  </span>
                ))}
              </span>
            )}
          </Field>
        </dl>
      </section>

      {tenantSlug && members.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-white p-6 shadow-sm"
          data-testid="control-assign"
        >
          <h2 className="text-sm font-semibold text-primary">{t('assign')}</h2>
          {control.isGlobal && <p className="text-xs text-secondary">{t('assignGlobalHint')}</p>}
          <form
            action={updateControlAction.bind(null, control.id)}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('owner')}</span>
              <select
                name="ownerMembershipId"
                defaultValue={control.ownerMembershipId ?? ''}
                className={inputCls}
              >
                <option value="">{t('noOwner')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('statusLabel')}</span>
              <select name="status" defaultValue={control.status} className={inputCls}>
                {CTRL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`st.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('note')}</span>
              <input name="note" defaultValue={control.note ?? ''} className={inputCls} />
            </label>
            <button
              type="submit"
              data-testid="control-save"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('save')}
            </button>
          </form>
        </section>
      )}

      {tenantSlug && members.length > 0 && (
        <ManageAccessSection
          entityType="control"
          entityId={control.id}
          path={`/controls/${control.id}`}
          grants={aclGrants}
          members={members}
          testid="control-access"
          labels={{
            title: t('access.title'),
            openHint: t('access.open'),
            restrictedHint: t('access.restricted'),
            member: t('access.member'),
            level: t('access.level'),
            view: t('access.view'),
            edit: t('access.edit'),
            grant: t('access.grant'),
            remove: t('access.remove'),
          }}
        />
      )}

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('tests')}</h2>
        {tests.length === 0 ? (
          <p className="text-sm text-secondary">{t('testsEmpty')}</p>
        ) : (
          <table className="w-full text-left text-sm" data-testid="control-tests">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="py-2 pr-4 font-medium">{t('testTitle')}</th>
                <th className="py-2 pr-4 font-medium">{t('testOwner')}</th>
                <th className="py-2 font-medium">{t('testStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((tst) => (
                <tr key={tst.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-foreground">{tst.title}</td>
                  <td className="py-2 pr-4 text-secondary">{tst.owner ?? '—'}</td>
                  <td className="py-2">
                    <span
                      className={
                        'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ' +
                        (tst.status === 'ok'
                          ? 'bg-green-100 text-green-800'
                          : tst.status === 'failing'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-muted text-secondary')
                      }
                    >
                      {t(`testStatuses.${tst.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('history')}</h2>
        {control.history.length === 0 ? (
          <p className="text-sm text-secondary">{t('historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="control-history">
            {control.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-4 text-sm">
                <span className="text-foreground">
                  {h.action}
                  {h.actor ? ` — ${h.actor}` : ''}
                </span>
                <time className="whitespace-nowrap text-secondary">
                  {dateFmt.format(new Date(h.at))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CommentsSection
        entityType="control"
        entityId={control.id}
        path={`/controls/${control.id}`}
        comments={control.comments}
        testid="control-comments"
      />
    </main>
  );
}
