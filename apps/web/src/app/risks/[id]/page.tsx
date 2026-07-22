import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { CommentsSection } from '@/components/comments-section';
import { TasksSection, type TaskItem } from '@/components/tasks-section';
import { ManageAccessSection, type AclGrantRow } from '@/components/manage-access-section';
import {
  decideRiskApprovalAction,
  deleteRiskAction,
  linkRiskControlAction,
  linkRiskEntityAction,
  rescoreRiskAction,
  submitRiskApprovalAction,
  updateRiskAction,
} from '../actions';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
type Treatment = 'mitigate' | 'transfer' | 'accept' | 'avoid';

interface RiskDetail {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  category: string | null;
  inherentImpact: number | null;
  inherentLikelihood: number | null;
  residualImpact: number | null;
  residualLikelihood: number | null;
  riskClass: RiskClass | null;
  residualClass: RiskClass | null;
  treatment: Treatment | null;
  status: string;
  ownerMembershipId: string | null;
  owner: string | null;
  approverMembershipId: string | null;
  approver: string | null;
  approvalStatus: string | null;
  approvedAt: string | null;
  amIApprover: boolean;
  aiReview: {
    source: 'risk_suggestion';
    decision: 'accepted';
    reviewStatus: 'accepted_by_human';
    sourceFindingId: string;
    confidence?: number;
    affectedProcess?: string;
    affectedAsset?: string;
    affectedControlRef?: string | null;
    evidenceRef?: { type: string; id: string; location: string };
    editedFields?: Array<{
      field: string;
      draftValue: string | number | null;
      acceptedValue: string | number | null;
    }>;
    dedupeFingerprint?: string;
  } | null;
}

interface Matrix {
  impactScale: number;
  likelihoodScale: number;
  thresholds: { medium: number; high: number; critical: number };
}

interface I18nText {
  en: string;
  az?: string;
  ru?: string;
}

const CLASS_TONE: Record<RiskClass, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};
const TREATMENTS: Treatment[] = ['mitigate', 'transfer', 'accept', 'avoid'];
const STATUSES = ['open', 'in_progress', 'closed'] as const;

const inputCls =
  'rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const primaryBtn =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const secondaryBtn =
  'rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function resolveName(name: I18nText, locale: string): string {
  return (name as unknown as Record<string, string | undefined>)[locale] ?? name.en;
}

/** Карточка риска (T-V12): скоринг/rescore, атрибуты, RCM-связи, universe, удаление. */
export default async function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, { id }] = await Promise.all([
    getTranslations('risks'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    params,
  ]);
  if (!tenantSlug) redirect('/account');

  const headers = { 'X-Tenant-Slug': tenantSlug };
  const res = await apiFetch(`/risks/${id}?locale=${locale}`, { headers });
  if (!res.ok) redirect('/risks');
  const r: RiskDetail = await res.json();

  const [
    matrixRes,
    controlsRes,
    entitiesRes,
    allControlsRes,
    universeRes,
    membersRes,
    cRes,
    tasksRes,
    aclRes,
  ] = await Promise.all([
    apiFetch('/risks/matrix', { headers }),
    apiFetch(`/risks/${id}/controls`, { headers }),
    apiFetch(`/risks/${id}/entities`, { headers }),
    apiFetch(`/controls?locale=${locale}`, { headers }),
    apiFetch('/universe', { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch(`/comments?entityType=risk&entityId=${id}`, { headers }),
    apiFetch(`/tasks?entityType=risk&entityId=${id}`, { headers }),
    apiFetch(`/entity-acl?entityType=risk&entityId=${id}`, { headers }),
  ]);
  const matrix: Matrix = matrixRes.ok
    ? await matrixRes.json()
    : { impactScale: 5, likelihoodScale: 5, thresholds: { medium: 6, high: 12, critical: 20 } };
  const linkedControls: Array<{ id: string; ref: string }> = controlsRes.ok
    ? await controlsRes.json()
    : [];
  const linkedEntities: Array<{ id: string; kind: string; nameI18n: I18nText }> = entitiesRes.ok
    ? await entitiesRes.json()
    : [];
  const allControls: Array<{ id: string; ref: string }> = allControlsRes.ok
    ? await allControlsRes.json()
    : [];
  const universeNodes: Array<{ id: string; kind: string; nameI18n: I18nText }> = universeRes.ok
    ? await universeRes.json()
    : [];
  const members: Array<{ id: string; fullName: string }> = membersRes.ok
    ? await membersRes.json()
    : [];
  const comments: Array<{ author: string; body: string; at: string }> = cRes.ok
    ? await cRes.json()
    : [];
  const tasks: TaskItem[] = tasksRes.ok ? await tasksRes.json() : [];
  const aclGrants: AclGrantRow[] = aclRes.ok ? await aclRes.json() : [];

  const linkedControlIds = new Set(linkedControls.map((c) => c.id));
  const linkableControls = allControls.filter((c) => !linkedControlIds.has(c.id));
  const linkedEntityIds = new Set(linkedEntities.map((e) => e.id));
  const linkableEntities = universeNodes.filter((e) => !linkedEntityIds.has(e.id));

  const classBadge = (c: RiskClass | null, label: string) => (
    <span className="flex items-center gap-1.5 text-sm">
      <span className="text-secondary">{label}:</span>
      {c ? (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASS_TONE[c]}`}>
          {t(`cls.${c}`)}
        </span>
      ) : (
        <span className="text-secondary">—</span>
      )}
    </span>
  );

  const scoreSelect = (name: string, label: string, current: number | null, scale: number) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-secondary">{label}</span>
      <select name={name} defaultValue={String(current ?? 3)} className={inputCls}>
        {Array.from({ length: scale }, (_, i) => i + 1).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );

  const statusLabel = (s: string) =>
    (STATUSES as readonly string[]).includes(s) ? t(`st.${s}`) : s;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div>
        <Link
          href="/risks"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          ← {t('back')}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3" data-testid="risk-header">
        <h1 className="text-2xl font-bold text-primary">{r.title}</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
          {statusLabel(r.status)}
        </span>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {classBadge(r.riskClass, t('inherent'))}
          {classBadge(r.residualClass, t('residual'))}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {(
            [
              [t('description'), r.description],
              [t('domain'), r.domain],
              [t('category'), r.category],
              [t('owner'), r.owner],
              [t('treatment'), r.treatment ? t(`tr.${r.treatment}`) : null],
            ] as Array<[string, string | null]>
          ).map(([label, value]) =>
            value ? (
              <div key={label} className="flex flex-col">
                <dt className="text-xs font-medium text-secondary">{label}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>

      {r.aiReview && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm"
          data-testid="risk-ai-review-trace"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">
                {t('aiTrace.kicker')}
              </p>
              <h2 className="text-sm font-semibold text-primary">{t('aiTrace.title')}</h2>
            </div>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              {t('aiTrace.accepted')}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-secondary">{t('confidence')}</dt>
              <dd className="text-foreground">
                {r.aiReview.confidence !== undefined
                  ? `${Math.round(r.aiReview.confidence * 100)}%`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-secondary">{t('controlClause')}</dt>
              <dd className="text-foreground">{r.aiReview.affectedControlRef ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-secondary">{t('affectedProcess')}</dt>
              <dd className="text-foreground">{r.aiReview.affectedProcess ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-secondary">{t('affectedAsset')}</dt>
              <dd className="text-foreground">{r.aiReview.affectedAsset ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-secondary">{t('aiTrace.evidence')}</dt>
              <dd className="text-foreground">{r.aiReview.evidenceRef?.location ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-secondary">{t('aiTrace.sourceFinding')}</dt>
              <dd>
                <Link
                  href={`/findings/${r.aiReview.sourceFindingId}`}
                  className="text-accent underline-offset-2 transition-colors hover:underline"
                >
                  {r.aiReview.sourceFindingId}
                </Link>
              </dd>
            </div>
            {r.aiReview.editedFields && r.aiReview.editedFields.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-secondary">{t('aiTrace.editedFields')}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {r.aiReview.editedFields.map((item) => (
                    <span
                      key={item.field}
                      className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-emerald-800"
                    >
                      {item.field}: {String(item.draftValue ?? '—')} →{' '}
                      {String(item.acceptedValue ?? '—')}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="risk-rescore"
      >
        <h2 className="text-sm font-semibold text-primary">{t('rescore')}</h2>
        <p className="text-xs text-secondary">
          {t('scoreNow', {
            ii: r.inherentImpact ?? '—',
            il: r.inherentLikelihood ?? '—',
            ri: r.residualImpact ?? '—',
            rl: r.residualLikelihood ?? '—',
          })}
        </p>
        <form
          action={rescoreRiskAction.bind(null, r.id)}
          className="flex flex-wrap items-end gap-3"
        >
          {scoreSelect(
            'inherentImpact',
            `${t('inherent')} · ${t('impact')}`,
            r.inherentImpact,
            matrix.impactScale,
          )}
          {scoreSelect(
            'inherentLikelihood',
            `${t('inherent')} · ${t('likelihood')}`,
            r.inherentLikelihood,
            matrix.likelihoodScale,
          )}
          {scoreSelect(
            'residualImpact',
            `${t('residual')} · ${t('impact')}`,
            r.residualImpact,
            matrix.impactScale,
          )}
          {scoreSelect(
            'residualLikelihood',
            `${t('residual')} · ${t('likelihood')}`,
            r.residualLikelihood,
            matrix.likelihoodScale,
          )}
          <button type="submit" className={primaryBtn} data-testid="rescore-submit">
            {t('applyRescore')}
          </button>
        </form>
      </section>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="risk-edit"
      >
        <h2 className="text-sm font-semibold text-primary">{t('edit')}</h2>
        <form action={updateRiskAction.bind(null, r.id)} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('treatment')}</span>
            <select name="treatment" defaultValue={r.treatment ?? 'mitigate'} className={inputCls}>
              {TREATMENTS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`tr.${tr}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('status')}</span>
            <select name="status" defaultValue={r.status} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`st.${s}`)}
                </option>
              ))}
            </select>
          </label>
          {members.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('owner')}</span>
              <select
                name="ownerMembershipId"
                defaultValue={r.ownerMembershipId ?? ''}
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
          )}
          {members.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('approver')}</span>
              <select
                name="approverMembershipId"
                defaultValue={r.approverMembershipId ?? ''}
                data-testid="risk-approver-select"
                className={inputCls}
              >
                <option value="">{t('noApprover')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('domain')}</span>
            <input name="domain" defaultValue={r.domain ?? ''} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('category')}</span>
            <input name="category" defaultValue={r.category ?? ''} className={inputCls} />
          </label>
          <button type="submit" className={primaryBtn} data-testid="risk-save">
            {t('save')}
          </button>
        </form>
      </section>

      {/* T-V57: согласование риска */}
      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="risk-approval"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-primary">{t('approval')}</h2>
          <span
            className={
              'rounded-full px-2 py-0.5 text-xs font-medium ' +
              (r.approvalStatus === 'approved'
                ? 'bg-emerald-100 text-emerald-700'
                : r.approvalStatus === 'pending'
                  ? 'bg-amber-100 text-amber-700'
                  : r.approvalStatus === 'rejected'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-muted text-secondary')
            }
            data-testid="risk-approval-badge"
          >
            {r.approvalStatus ? t(`appr.${r.approvalStatus}`) : t('appr.none')}
          </span>
        </div>
        <p className="text-xs text-secondary">
          {t('approver')}: <span className="text-foreground">{r.approver ?? '—'}</span>
        </p>
        {/* Автор отправляет на согласование, если назначен approver и ещё не на согласовании */}
        {r.approverMembershipId && r.approvalStatus !== 'pending' && (
          <form action={submitRiskApprovalAction.bind(null, r.id)}>
            <button type="submit" className={primaryBtn} data-testid="risk-submit-approval">
              {t('submitApproval')}
            </button>
          </form>
        )}
        {/* Согласующий принимает решение, когда статус pending */}
        {r.amIApprover && r.approvalStatus === 'pending' && (
          <form
            action={decideRiskApprovalAction.bind(null, r.id)}
            className="flex gap-2"
            data-testid="risk-decide"
          >
            <button
              type="submit"
              name="decision"
              value="approved"
              className={primaryBtn}
              data-testid="risk-approve"
            >
              {t('approve')}
            </button>
            <button
              type="submit"
              name="decision"
              value="rejected"
              className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="risk-reject"
            >
              {t('reject')}
            </button>
          </form>
        )}
      </section>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="risk-controls"
      >
        <h2 className="text-sm font-semibold text-primary">{t('linkedControls')}</h2>
        {linkedControls.length === 0 ? (
          <p className="text-sm text-secondary">{t('noLinks')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {linkedControls.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/controls/${c.id}`}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-border"
                >
                  {c.ref}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {linkableControls.length > 0 && (
          <form
            action={linkRiskControlAction.bind(null, r.id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('linkControl')}</span>
              <select name="controlId" className={inputCls} data-testid="link-control-select">
                {linkableControls.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ref}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={secondaryBtn} data-testid="link-control-submit">
              {t('link')}
            </button>
          </form>
        )}
      </section>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="risk-entities"
      >
        <h2 className="text-sm font-semibold text-primary">{t('linkedEntities')}</h2>
        {linkedEntities.length === 0 ? (
          <p className="text-sm text-secondary">{t('noLinks')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {linkedEntities.map((e) => (
              <li
                key={e.id}
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary"
              >
                {resolveName(e.nameI18n, locale)}
              </li>
            ))}
          </ul>
        )}
        {linkableEntities.length > 0 && (
          <form
            action={linkRiskEntityAction.bind(null, r.id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('linkEntity')}</span>
              <select name="entityId" className={inputCls} data-testid="link-entity-select">
                {linkableEntities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {resolveName(e.nameI18n, locale)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={secondaryBtn} data-testid="link-entity-submit">
              {t('link')}
            </button>
          </form>
        )}
      </section>

      <TasksSection
        entityType="risk"
        entityId={r.id}
        path={`/risks/${r.id}`}
        tasks={tasks}
        members={members}
        testid="risk-tasks"
        title={t('actionTracker')}
      />

      <ManageAccessSection
        entityType="risk"
        entityId={r.id}
        path={`/risks/${r.id}`}
        grants={aclGrants}
        members={members}
        testid="risk-access"
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

      <CommentsSection
        entityType="risk"
        entityId={r.id}
        path={`/risks/${r.id}`}
        comments={comments}
        testid="risk-comments"
      />

      <section className="flex items-center justify-between rounded-xl border border-red-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-secondary">{t('deleteHint')}</p>
        <form action={deleteRiskAction.bind(null, r.id)}>
          <button
            type="submit"
            data-testid="risk-delete"
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('delete')}
          </button>
        </form>
      </section>
    </main>
  );
}
