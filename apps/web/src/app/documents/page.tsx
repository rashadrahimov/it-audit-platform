import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { reassignDocumentOwnerAction, uploadDocumentAction } from './actions';
import {
  createAuditFirmAction,
  deleteAuditFirmAction,
  setEvidenceReviewAction,
} from './evidence-actions';

export const dynamic = 'force-dynamic';

interface DocRow {
  id: string;
  filename: string;
  mime: string;
  size: number;
  version: number;
  renewBy: string | null;
  status: string;
  createdAt: string;
  owner: string | null;
  links: number;
}
interface Member {
  id: string;
  fullName: string;
  role: string;
}
interface ControlOpt {
  id: string;
  ref: string;
}
interface EngagementOpt {
  id: string;
  title: string;
}
interface EvidenceReview {
  status: string;
  reviewer: string | null;
  reviewedAt: string | null;
}
interface AuditFirm {
  id: string;
  name: string;
  contactEmail: string | null;
}

const REVIEW_STATUSES = ['not_ready', 'ready', 'flagged', 'accepted'] as const;
const REVIEW_TONE: Record<string, string> = {
  not_ready: 'bg-muted text-secondary',
  ready: 'bg-sky-100 text-sky-700',
  flagged: 'bg-red-100 text-red-700',
  accepted: 'bg-emerald-100 text-emerald-700',
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Реестр документов-доказательств (T-V01): загрузка, привязки, скачивание, owner. */
export default async function DocumentsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('documents'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const [docsRes, membersRes, controlsRes, engagementsRes] = await Promise.all([
    apiFetch('/documents', { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch(`/controls?tenantSlug=${tenantSlug}&locale=${locale}`, { headers }),
    apiFetch(`/engagements?locale=${locale}`, { headers }),
  ]);
  const docs: DocRow[] = docsRes.ok ? await docsRes.json() : [];
  const members: Member[] = membersRes.ok ? await membersRes.json() : [];
  const controls: ControlOpt[] = controlsRes.ok ? await controlsRes.json() : [];
  const engagements: EngagementOpt[] = engagementsRes.ok ? await engagementsRes.json() : [];

  // T-V29: статусы ревью evidence по документам + реестр аудиторских фирм
  const [reviewsRes, firmsRes] = await Promise.all([
    docs.length > 0
      ? apiFetch(
          `/audit-firms/evidence-batch?entityType=document&entityIds=${docs.map((d) => d.id).join(',')}`,
          { headers },
        )
      : Promise.resolve(null),
    apiFetch('/audit-firms', { headers }),
  ]);
  const reviews: Record<string, EvidenceReview> =
    reviewsRes && reviewsRes.ok ? await reviewsRes.json() : {};
  const firms: AuditFirm[] = firmsRes.ok ? await firmsRes.json() : [];

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form
        action={uploadDocumentAction}
        data-testid="document-upload"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('upload')}</span>
          <input
            type="file"
            name="file"
            required
            className="text-sm text-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('linkTo')}</span>
          <select
            name="target"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">{t('linkNone')}</option>
            <optgroup label={t('linkControls')}>
              {controls.map((c) => (
                <option key={c.id} value={`control:${c.id}`}>
                  {c.ref}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('linkEngagements')}>
              {engagements.map((e) => (
                <option key={e.id} value={`engagement:${e.id}`}>
                  {e.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('renewBy')}</span>
          <input
            type="date"
            name="renewBy"
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('uploadBtn')}
        </button>
      </form>

      <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm" data-testid="documents-table">
          <thead>
            <tr className="border-b border-border text-secondary">
              <th className="px-4 py-3 font-medium">{t('colName')}</th>
              <th className="px-4 py-3 font-medium">{t('colSize')}</th>
              <th className="px-4 py-3 font-medium">{t('colOwner')}</th>
              <th className="px-4 py-3 font-medium">{t('evidence')}</th>
              <th className="px-4 py-3 font-medium">{t('colLinks')}</th>
              <th className="px-4 py-3 font-medium">{t('colRenewBy')}</th>
              <th className="px-4 py-3 font-medium">{t('colUploaded')}</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-3 font-medium">
                  <a
                    href={`/documents/${d.id}/download`}
                    className="text-accent underline-offset-2 transition-colors duration-150 hover:underline"
                  >
                    {d.filename}
                  </a>
                  {d.version > 1 && (
                    <span className="ml-1 text-xs text-secondary">v{d.version}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-secondary tabular-nums whitespace-nowrap">
                  {fmtSize(d.size)}
                </td>
                <td className="px-4 py-3 text-secondary">
                  {members.length > 0 ? (
                    <form
                      action={reassignDocumentOwnerAction.bind(null, d.id)}
                      className="flex items-center gap-1.5"
                    >
                      <select
                        name="ownerMembershipId"
                        defaultValue={members.find((m) => m.fullName === d.owner)?.id ?? ''}
                        className="rounded-md border border-border bg-white px-1.5 py-1 text-xs text-foreground"
                      >
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                      >
                        {t('ownerSave')}
                      </button>
                    </form>
                  ) : (
                    (d.owner ?? '—')
                  )}
                </td>
                <td className="px-4 py-3" data-testid={`evidence-${d.id}`}>
                  <form
                    action={setEvidenceReviewAction.bind(null, 'document', d.id)}
                    className="flex items-center gap-1.5"
                  >
                    <select
                      name="status"
                      defaultValue={reviews[d.id]?.status ?? 'not_ready'}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_TONE[reviews[d.id]?.status ?? 'not_ready']}`}
                    >
                      {REVIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`ev.${s}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      data-testid="evidence-save"
                      className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                    >
                      {t('ownerSave')}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-secondary tabular-nums">{d.links}</td>
                <td className="px-4 py-3 text-secondary whitespace-nowrap">
                  {d.renewBy ? dateFmt.format(new Date(d.renewBy)) : '—'}
                </td>
                <td className="px-4 py-3 text-secondary whitespace-nowrap tabular-nums">
                  {dateFmt.format(new Date(d.createdAt))}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState size="sm" text={t('empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="audit-firms"
      >
        <h2 className="text-sm font-semibold text-primary">{t('auditFirms')}</h2>
        <p className="text-xs text-secondary">{t('auditFirmsHint')}</p>
        {firms.length > 0 && (
          <ul className="flex flex-col gap-2">
            {firms.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-foreground">{f.name}</span>
                  {f.contactEmail && (
                    <span className="ml-2 text-xs text-secondary">{f.contactEmail}</span>
                  )}
                </span>
                <form action={deleteAuditFirmAction.bind(null, f.id)}>
                  <button
                    type="submit"
                    data-testid="firm-delete"
                    aria-label={t('firmDelete')}
                    className="rounded-md border border-border px-1.5 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form
          action={createAuditFirmAction}
          className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
          data-testid="firm-create"
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('firmName')}</span>
            <input
              name="name"
              required
              placeholder={t('firmNamePh')}
              className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('firmEmail')}</span>
            <input
              name="contactEmail"
              type="email"
              className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
          <button
            type="submit"
            data-testid="firm-add"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('firmAdd')}
          </button>
        </form>
      </section>
    </main>
  );
}
