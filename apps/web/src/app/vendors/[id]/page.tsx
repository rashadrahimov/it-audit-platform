import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { CommentsSection } from '@/components/comments-section';
import {
  attachAssessmentDocumentAction,
  createAssessmentAction,
  saveVendorIntakeAction,
  transitionAssessmentAction,
  transitionVendorAction,
  updateVendorAction,
} from '../actions';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
type VStatus = 'procurement' | 'active' | 'archived';

interface VendorDetail {
  id: string;
  name: string;
  category: string | null;
  url: string | null;
  inherentRisk: RiskClass | null;
  residualRisk: RiskClass | null;
  status: VStatus;
  intake: Record<string, unknown>;
  securityOwnerMembershipId: string | null;
  securityOwner: string | null;
}
interface Assessment {
  id: string;
  type: string | null;
  state: 'requested' | 'in_progress' | 'completed';
  recommendation: string | null;
  evidenceStatus: string | null;
  dueDate: string | null;
  documents: Array<{ id: string; filename: string }>;
}
interface ListItem {
  code: string;
  labelI18n: { en: string; ru?: string; az?: string };
}

const RISK_TONE: Record<RiskClass, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};
const STATE_TONE: Record<Assessment['state'], string> = {
  requested: 'bg-muted text-secondary',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
};
const NEXT: Record<VStatus, VStatus[]> = {
  procurement: ['active', 'archived'],
  active: ['archived'],
  archived: [],
};
const RISK_CLASSES: RiskClass[] = ['low', 'medium', 'high', 'critical'];
const INTAKE_FIELDS = ['businessPurpose', 'dataTypes', 'dataClassification', 'authMethod'] as const;
const DATA_CLASSES = ['public', 'internal', 'confidential', 'restricted'];
const AUTH_METHODS = ['sso', 'password', 'api_key'];

const inputCls =
  'rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const primaryBtn =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const secondaryBtn =
  'rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Карточка вендора (T-V13): редактирование, intake, assessment-цикл с evidence. */
export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, { id }] = await Promise.all([
    getTranslations('vendors'),
    getLocale(),
    getActiveTenantSlug(),
    params,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch(`/vendors/${id}`, { headers });
  if (!res.ok) notFound();
  const vendor: VendorDetail = await res.json();

  const [aRes, catRes, membersRes, docsRes, cRes] = await Promise.all([
    apiFetch(`/vendors/${id}/assessments`, { headers }),
    apiFetch('/config-lists/vendor_categories', { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch('/documents', { headers }),
    apiFetch(`/comments?entityType=vendor&entityId=${id}`, { headers }),
  ]);
  const assessments: Assessment[] = aRes.ok ? await aRes.json() : [];
  const categories: ListItem[] = catRes.ok ? (await catRes.json()).items : [];
  const members: Array<{ id: string; fullName: string }> = membersRes.ok
    ? await membersRes.json()
    : [];
  const documents: Array<{ id: string; filename: string }> = docsRes.ok ? await docsRes.json() : [];
  const comments: Array<{ author: string; body: string; at: string }> = cRes.ok
    ? await cRes.json()
    : [];

  const catLabel = (code: string | null) => {
    if (!code) return null;
    const item = categories.find((c) => c.code === code);
    if (!item) return code;
    return (
      (item.labelI18n as Record<string, string | undefined>)[locale] ?? item.labelI18n.en ?? code
    );
  };
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  const riskBadge = (r: RiskClass | null, label: string) => (
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-secondary">{label}:</span>
      {r ? (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RISK_TONE[r]}`}>
          {t(`cls.${r}`)}
        </span>
      ) : (
        <span className="text-secondary">—</span>
      )}
    </div>
  );

  const intakeValue = (k: string) => {
    const v = vendor.intake?.[k];
    return typeof v === 'string' ? v : '';
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{vendor.name}</h1>
        <Link
          href="/vendors"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('back')}
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {riskBadge(vendor.inherentRisk, t('risk'))}
          {riskBadge(vendor.residualRisk, t('residual'))}
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-secondary">{t('statusLabel')}:</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
              {t(`status.${vendor.status}`)}
            </span>
          </div>
          {NEXT[vendor.status].length > 0 && (
            <form action={transitionVendorAction} className="flex gap-1.5">
              <input type="hidden" name="id" value={vendor.id} />
              {NEXT[vendor.status].map((to) => (
                <button
                  key={to}
                  type="submit"
                  name="to"
                  value={to}
                  className={secondaryBtn}
                  data-testid={`vendor-to-${to}`}
                >
                  → {t(`status.${to}`)}
                </button>
              ))}
            </form>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {(
            [
              [t('category'), catLabel(vendor.category)],
              [t('url'), vendor.url],
              [t('securityOwner'), vendor.securityOwner],
            ] as Array<[string, string | null]>
          ).map(([label, value]) =>
            value ? (
              <div key={label} className="flex flex-col">
                <dt className="text-xs font-medium text-secondary">{label}</dt>
                <dd className="break-all text-foreground">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="vendor-edit"
      >
        <h2 className="text-sm font-semibold text-primary">{t('edit')}</h2>
        <form
          action={updateVendorAction.bind(null, vendor.id)}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('namePh')}</span>
            <input name="name" defaultValue={vendor.name} required className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('category')}</span>
            <select name="category" defaultValue={vendor.category ?? ''} className={inputCls}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {catLabel(c.code)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('url')}</span>
            <input name="url" defaultValue={vendor.url ?? ''} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('risk')}</span>
            <select
              name="inherentRisk"
              defaultValue={vendor.inherentRisk ?? 'medium'}
              className={inputCls}
            >
              {RISK_CLASSES.map((r) => (
                <option key={r} value={r}>
                  {t(`cls.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('residual')}</span>
            <select
              name="residualRisk"
              defaultValue={vendor.residualRisk ?? 'medium'}
              className={inputCls}
            >
              {RISK_CLASSES.map((r) => (
                <option key={r} value={r}>
                  {t(`cls.${r}`)}
                </option>
              ))}
            </select>
          </label>
          {members.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('securityOwner')}</span>
              <select
                name="securityOwnerMembershipId"
                defaultValue={vendor.securityOwnerMembershipId ?? ''}
                className={inputCls}
              >
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className={primaryBtn} data-testid="vendor-save">
            {t('save')}
          </button>
        </form>
      </section>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="vendor-intake"
      >
        <h2 className="text-sm font-semibold text-primary">{t('intake')}</h2>
        <p className="text-xs text-secondary">{t('intakeHint')}</p>
        <form
          action={saveVendorIntakeAction.bind(null, vendor.id)}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('in.businessPurpose')}</span>
            <input
              name="businessPurpose"
              defaultValue={intakeValue('businessPurpose')}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('in.dataTypes')}</span>
            <input name="dataTypes" defaultValue={intakeValue('dataTypes')} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('in.dataClassification')}</span>
            <select
              name="dataClassification"
              defaultValue={intakeValue('dataClassification')}
              className={inputCls}
            >
              <option value="">—</option>
              {DATA_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {t(`dc.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('in.authMethod')}</span>
            <select name="authMethod" defaultValue={intakeValue('authMethod')} className={inputCls}>
              <option value="">—</option>
              {AUTH_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`am.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-secondary">{t('in.notes')}</span>
            <textarea
              name="notes"
              rows={2}
              defaultValue={intakeValue('notes')}
              className={inputCls}
            />
          </label>
          <div>
            <button type="submit" className={primaryBtn} data-testid="intake-save">
              {t('saveIntake')}
            </button>
          </div>
        </form>
        {INTAKE_FIELDS.some((k) => intakeValue(k)) && (
          <dl
            className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-2"
            data-testid="intake-view"
          >
            {INTAKE_FIELDS.map((k) => {
              const raw = intakeValue(k);
              if (!raw) return null;
              const shown =
                k === 'dataClassification' && DATA_CLASSES.includes(raw)
                  ? t(`dc.${raw}`)
                  : k === 'authMethod' && AUTH_METHODS.includes(raw)
                    ? t(`am.${raw}`)
                    : raw;
              return (
                <div key={k} className="flex flex-col">
                  <dt className="text-xs font-medium text-secondary">{t(`in.${k}`)}</dt>
                  <dd className="text-foreground">{shown}</dd>
                </div>
              );
            })}
            {intakeValue('notes') && (
              <div className="flex flex-col sm:col-span-2">
                <dt className="text-xs font-medium text-secondary">{t('in.notes')}</dt>
                <dd className="text-foreground">{intakeValue('notes')}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="flex flex-col gap-3" data-testid="vendor-assessments-block">
        <h2 className="text-sm font-semibold text-secondary">{t('assessments')}</h2>
        <form
          action={createAssessmentAction.bind(null, vendor.id)}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="assessment-create"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('assessmentType')}</span>
            <input name="type" placeholder={t('assessmentTypePh')} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('due')}</span>
            <input type="date" name="dueDate" className={inputCls} />
          </label>
          <button type="submit" className={primaryBtn} data-testid="assessment-add">
            {t('addAssessment')}
          </button>
        </form>

        {assessments.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('noAssessments')} />
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="vendor-assessments">
            {assessments.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{a.type ?? '—'}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_TONE[a.state] ?? 'bg-muted text-secondary'}`}
                  >
                    {t(`ast.${a.state}`)}
                  </span>
                  {a.evidenceStatus && (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary">
                      {t('evidence')}:{' '}
                      {a.evidenceStatus === 'provided' ? t('evProvided') : a.evidenceStatus}
                    </span>
                  )}
                  {a.dueDate && (
                    <span className="text-xs text-secondary tabular-nums">
                      {t('due')}: {dateFmt.format(new Date(a.dueDate))}
                    </span>
                  )}
                </div>
                {a.recommendation && (
                  <p className="text-sm text-secondary">
                    {t('recommendation')}:{' '}
                    <span className="text-foreground">{a.recommendation}</span>
                  </p>
                )}
                {a.documents.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {a.documents.map((d) => (
                      <li key={d.id}>
                        <a
                          href={`/documents/${d.id}/download`}
                          className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-border"
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            className="mr-1 inline h-3.5 w-3.5 align-[-2px]"
                          >
                            <path d="M6.75 3.75h7.5l3 3v13.5H6.75V3.75z" />
                            <path d="M14.25 3.75v3h3" />
                          </svg>
                          {d.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  {a.state === 'requested' && (
                    <form
                      action={transitionAssessmentAction.bind(null, vendor.id, a.id, 'in_progress')}
                    >
                      <button type="submit" className={secondaryBtn} data-testid="assessment-start">
                        {t('startAssessment')}
                      </button>
                    </form>
                  )}
                  {a.state === 'in_progress' && (
                    <form
                      action={transitionAssessmentAction.bind(null, vendor.id, a.id, 'completed')}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium text-secondary">{t('recommendation')}</span>
                        <input
                          name="recommendation"
                          placeholder={t('recommendationPh')}
                          className={inputCls}
                        />
                      </label>
                      <button
                        type="submit"
                        className={secondaryBtn}
                        data-testid="assessment-complete"
                      >
                        {t('completeAssessment')}
                      </button>
                    </form>
                  )}
                  {a.state !== 'completed' && documents.length > 0 && (
                    <form
                      action={attachAssessmentDocumentAction.bind(null, vendor.id, a.id)}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium text-secondary">{t('attachDoc')}</span>
                        <select
                          name="documentId"
                          className={inputCls}
                          data-testid="attach-doc-select"
                        >
                          {documents.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.filename}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        className={secondaryBtn}
                        data-testid="attach-doc-submit"
                      >
                        {t('attach')}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CommentsSection
        entityType="vendor"
        entityId={vendor.id}
        path={`/vendors/${vendor.id}`}
        comments={comments}
        testid="vendor-comments"
      />
    </main>
  );
}
