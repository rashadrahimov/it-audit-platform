import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { reassignDocumentOwnerAction, uploadDocumentAction } from './actions';

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
                <td colSpan={6} className="p-0">
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
