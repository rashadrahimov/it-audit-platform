import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import {
  addPolicyVersionAction,
  attestPolicyAction,
  campaignPolicyAction,
  decisionPolicyAction,
  submitPolicyAction,
} from '../actions';

export const dynamic = 'force-dynamic';

interface PolicyDetail {
  id: string;
  title: string;
  status: string;
  renewBy: string | null;
  expired: boolean;
  owner: string | null;
  approver: string | null;
  frameworks: string[];
  versions: Array<{
    version: number;
    documentId: string | null;
    changelog: string | null;
    approvedAt: string | null;
  }>;
}
interface Attestations {
  version: number;
  total: number;
  attested: number;
  rows: Array<{ member: string; status: string; attestedAt: string | null }>;
}
interface Member {
  id: string;
  fullName: string;
  role: string;
}
interface DocOpt {
  id: string;
  filename: string;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-secondary',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  archived: 'bg-muted text-secondary',
};

const primaryBtn =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const secondaryBtn =
  'rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Карточка политики (T-V04): workflow, версии, attestation — всё из UI. */
export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, { id }] = await Promise.all([
    getTranslations('policies'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    params,
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const res = await apiFetch(`/policies/${id}?locale=${locale}`, { headers });
  if (!res.ok) redirect('/policies');
  const p: PolicyDetail = await res.json();

  const [attRes, mRes, dRes] = await Promise.all([
    apiFetch(`/policies/${id}/attestations?locale=${locale}`, { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch('/documents', { headers }),
  ]);
  const attestations: Attestations | null = attRes.ok ? await attRes.json() : null;
  const members: Member[] = mRes.ok ? await mRes.json() : [];
  const docs: DocOpt[] = dRes.ok ? await dRes.json() : [];

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const isAdmin = members.length > 0; // settings.view открыл memberships → админ-возможности

  const workflowButtons: Array<{
    key: string;
    label: string;
    action: () => Promise<void>;
    primary: boolean;
  }> = [];
  if (p.status === 'draft') {
    workflowButtons.push({
      key: 'submit',
      label: t('wfSubmit'),
      action: submitPolicyAction.bind(null, p.id, 'submit'),
      primary: true,
    });
    workflowButtons.push({
      key: 'archive',
      label: t('wfArchive'),
      action: submitPolicyAction.bind(null, p.id, 'archive'),
      primary: false,
    });
  } else if (p.status === 'in_review') {
    workflowButtons.push({
      key: 'approve',
      label: t('wfApprove'),
      action: decisionPolicyAction.bind(null, p.id, 'approve'),
      primary: true,
    });
    workflowButtons.push({
      key: 'reject',
      label: t('wfReject'),
      action: decisionPolicyAction.bind(null, p.id, 'reject'),
      primary: false,
    });
  } else if (p.status === 'approved') {
    workflowButtons.push({
      key: 'archive',
      label: t('wfArchive'),
      action: submitPolicyAction.bind(null, p.id, 'archive'),
      primary: false,
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div>
        <Link
          href="/policies"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          ← {t('back')}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3" data-testid="policy-header">
        <h1 className="text-2xl font-bold text-primary">{p.title}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[p.status] ?? 'bg-muted text-secondary'}`}
        >
          {t(`statuses.${p.status}`)}
        </span>
        {p.expired && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            {t('expired')}
          </span>
        )}
      </header>

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="policy-fields"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('owner')}</dt>
            <dd className="text-sm text-foreground">{p.owner ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('approver')}</dt>
            <dd className="text-sm text-foreground">{p.approver ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('renewBy')}</dt>
            <dd className="text-sm text-foreground">
              {p.renewBy ? dateFmt.format(new Date(p.renewBy)) : '—'}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-secondary">{t('frameworks')}</dt>
            <dd className="flex flex-wrap gap-1 text-sm text-foreground">
              {p.frameworks.length === 0
                ? '—'
                : p.frameworks.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary"
                    >
                      {f}
                    </span>
                  ))}
            </dd>
          </div>
        </dl>
      </section>

      {workflowButtons.length > 0 && (
        <section
          className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="policy-workflow"
        >
          <span className="text-sm font-medium text-secondary">{t('workflow')}:</span>
          {workflowButtons.map((b) => (
            <form key={b.key} action={b.action}>
              <button
                type="submit"
                className={b.primary ? primaryBtn : secondaryBtn}
                data-testid={`policy-wf-${b.key}`}
              >
                {b.label}
              </button>
            </form>
          ))}
        </section>
      )}

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="policy-versions"
      >
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('versions')}</h2>
        {p.versions.length === 0 ? (
          <p className="text-sm text-secondary">{t('versionsEmpty')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">{t('changelog')}</th>
                <th className="px-3 py-2 font-medium">{t('document')}</th>
                <th className="px-3 py-2 font-medium">{t('approvedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {p.versions.map((v) => (
                <tr key={v.version} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium tabular-nums">v{v.version}</td>
                  <td className="px-3 py-2 text-secondary">{v.changelog ?? '—'}</td>
                  <td className="px-3 py-2">
                    {v.documentId ? (
                      <a
                        href={`/documents/${v.documentId}/download`}
                        className="text-accent underline-offset-2 hover:underline"
                      >
                        {t('download')}
                      </a>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-secondary tabular-nums">
                    {v.approvedAt ? `✓ ${dateFmt.format(new Date(v.approvedAt))}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isAdmin && p.status !== 'archived' && (
          <form
            action={addPolicyVersionAction.bind(null, p.id)}
            className="mt-3 flex flex-wrap items-end gap-3"
            data-testid="policy-add-version"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('document')}</span>
              <select
                name="documentId"
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">—</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t('changelog')}</span>
              <input
                name="changelog"
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <button type="submit" className={secondaryBtn}>
              {t('addVersion')}
            </button>
          </form>
        )}
      </section>

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="policy-attestations"
      >
        <h2 className="mb-3 text-sm font-semibold text-primary">
          {t('attestations')}
          {attestations && attestations.total > 0 && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary tabular-nums">
              {attestations.attested}/{attestations.total}
            </span>
          )}
        </h2>
        {attestations && attestations.rows.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {attestations.rows.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-foreground">{r.member}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === 'attested'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {t(`attStatuses.${r.status}`)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-secondary">{t('attestationsEmpty')}</p>
        )}
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {isAdmin && p.status === 'approved' && (
            <form
              action={campaignPolicyAction.bind(null, p.id)}
              className="flex flex-col gap-2"
              data-testid="policy-campaign"
            >
              <span className="text-xs font-medium text-secondary">{t('campaignPick')}</span>
              <div className="flex flex-wrap gap-3">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-1.5 text-sm text-foreground">
                    <input type="checkbox" name="membershipId" value={m.id} />
                    {m.fullName}
                  </label>
                ))}
              </div>
              <button type="submit" className={secondaryBtn}>
                {t('campaignStart')}
              </button>
            </form>
          )}
          <form action={attestPolicyAction.bind(null, p.id)} data-testid="policy-attest-self">
            <button type="submit" className={secondaryBtn}>
              {t('attestSelf')}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
