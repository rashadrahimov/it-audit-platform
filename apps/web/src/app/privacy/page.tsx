import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import {
  approveDpiaAction,
  archiveRopaAction,
  createDpiaAction,
  createRopaAction,
  transitionDpiaAction,
} from './actions';
import { RopaImport } from './ropa-import';

export const dynamic = 'force-dynamic';

interface I18nText {
  en: string;
  az?: string;
  ru?: string;
}
interface Ropa {
  id: string;
  nameI18n: I18nText;
  legalBasis: string;
  role: string;
  crossBorder: boolean;
  status: 'active' | 'archived';
  vendorName: string | null;
  dataLocations: string[];
  reviewDate: string | null;
}
type DpiaStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'completed';
interface Dpia {
  id: string;
  title: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: DpiaStatus;
  processingActivityId: string;
  approver: string | null;
}
interface Member {
  id: string;
  fullName: string;
}
interface Vendor {
  id: string;
  name: string;
}

const LEGAL_BASES = ['consent', 'contract', 'legal_obligation', 'vital', 'public', 'legitimate'];
const ROLES = ['controller', 'processor', 'joint'];
const RISK_LEVELS = ['low', 'medium', 'high'];
const ROLE_TABS = ['all', 'controller', 'processor'] as const;
const LVL_TONE: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};
const DPIA_NEXT: Record<DpiaStatus, DpiaStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['pending_approval', 'completed'],
  pending_approval: [],
  approved: [],
  completed: [],
};

function resolveName(name: I18nText, locale: string): string {
  return (name as unknown as Record<string, string | undefined>)[locale] ?? name.en;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const btnCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Privacy — ROPA (T-074) + DPIA (T-075, T-V41): реестр со связями + approval-workflow. */
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; dpia?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('privacy'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
  const role = ROLE_TABS.includes(sp.role as (typeof ROLE_TABS)[number]) ? sp.role : 'all';
  const dpiaQueue = sp.dpia === 'mine';

  const [ropaRes, dpiaRes, memRes, venRes] = await Promise.all([
    apiFetch(`/processing-activities${role && role !== 'all' ? `?role=${role}` : ''}`, { headers }),
    apiFetch(`/processing-activities/dpia${dpiaQueue ? '?needsMyApproval=true' : ''}`, { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch('/vendors', { headers }),
  ]);
  const ropa: Ropa[] = ropaRes.ok ? await ropaRes.json() : [];
  const dpia: Dpia[] = dpiaRes.ok ? await dpiaRes.json() : [];
  const members: Member[] = memRes.ok ? await memRes.json() : [];
  const vendors: Vendor[] = venRes.ok ? await venRes.json() : [];

  const tabCls = (on: boolean) =>
    `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-150 ${
      on ? 'bg-accent text-on-primary' : 'bg-muted text-secondary hover:bg-border'
    }`;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* ROPA */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-secondary">{t('ropa')}</h2>
          <nav data-testid="ropa-role-tabs" className="ml-auto flex gap-1.5">
            {ROLE_TABS.map((rt) => (
              <Link
                key={rt}
                href={rt === 'all' ? '/privacy' : `/privacy?role=${rt}`}
                className={tabCls(role === rt)}
              >
                {rt === 'all' ? t('tabAll') : t(`rl.${rt}`)}
              </Link>
            ))}
          </nav>
        </div>
        <form
          action={createRopaAction}
          data-testid="ropa-create"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <input name="name" required placeholder={t('name')} className={`flex-1 ${inputCls}`} />
          <input name="purpose" placeholder={t('purpose')} className={inputCls} />
          <select name="legalBasis" defaultValue="consent" className={inputCls}>
            {LEGAL_BASES.map((b) => (
              <option key={b} value={b}>
                {t(`lb.${b}`)}
              </option>
            ))}
          </select>
          <select name="role" defaultValue="controller" className={inputCls}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`rl.${r}`)}
              </option>
            ))}
          </select>
          <select name="vendorId" defaultValue="" className={inputCls}>
            <option value="">{t('vendorNone')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <input name="dataLocations" placeholder={t('dataLocationsPh')} className={inputCls} />
          <label className="flex flex-col gap-1 text-xs text-secondary">
            <span>{t('reviewDate')}</span>
            <input type="date" name="reviewDate" className={inputCls} />
          </label>
          <label className="flex items-center gap-1.5 self-end pb-2.5 text-sm text-secondary">
            <input type="checkbox" name="crossBorder" />
            {t('crossBorderLabel')}
          </label>
          <button type="submit" className={btnCls}>
            {t('add')}
          </button>
        </form>
        <RopaImport />
        {ropa.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('empty')} />
          </div>
        ) : (
          <ul
            className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            data-testid="ropa-list"
          >
            {ropa.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {resolveName(r.nameI18n, locale)}
                  </span>
                  <span className="text-xs text-secondary">
                    {t(`lb.${r.legalBasis}`)} · {t(`rl.${r.role}`)}
                  </span>
                  {r.vendorName && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                      {r.vendorName}
                    </span>
                  )}
                  {r.dataLocations.length > 0 && (
                    <span className="text-xs text-secondary">📍 {r.dataLocations.join(', ')}</span>
                  )}
                  {r.crossBorder && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {t('crossBorder')}
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary">
                    {t(`st.${r.status}`)}
                  </span>
                  {r.status === 'active' && (
                    <form action={archiveRopaAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-border px-2 py-1 text-xs text-secondary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {t('archive')}
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* DPIA */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-secondary">{t('dpia')}</h2>
          <nav data-testid="dpia-queue-tabs" className="ml-auto flex gap-1.5">
            <Link href="/privacy" className={tabCls(!dpiaQueue)}>
              {t('tabAll')}
            </Link>
            <Link href="/privacy?dpia=mine" className={tabCls(dpiaQueue)}>
              {t('needsApproval')}
            </Link>
          </nav>
        </div>
        {ropa.length > 0 && !dpiaQueue && (
          <form
            action={createDpiaAction}
            data-testid="dpia-create"
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <select name="processingActivityId" className={inputCls} defaultValue={ropa[0]!.id}>
              {ropa.map((r) => (
                <option key={r.id} value={r.id}>
                  {resolveName(r.nameI18n, locale)}
                </option>
              ))}
            </select>
            <input
              name="title"
              required
              placeholder={t('titlePh')}
              className={`flex-1 ${inputCls}`}
            />
            <select name="riskLevel" defaultValue="medium" className={inputCls}>
              {RISK_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`lvl.${l}`)}
                </option>
              ))}
            </select>
            <select name="approverMembershipId" defaultValue="" className={inputCls}>
              <option value="">{t('approverNone')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
            <button type="submit" className={btnCls}>
              {t('add')}
            </button>
          </form>
        )}
        {dpia.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('empty')} />
          </div>
        ) : (
          <ul
            className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            data-testid="dpia-list"
          >
            {dpia.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{d.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${LVL_TONE[d.riskLevel]}`}
                  >
                    {t(`lvl.${d.riskLevel}`)}
                  </span>
                  {d.approver && (
                    <span className="text-xs text-secondary">
                      {t('approver')}: {d.approver}
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary">
                    {t(`st.${d.status}`)}
                  </span>
                  {DPIA_NEXT[d.status].map((to) => (
                    <form key={to} action={transitionDpiaAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="to" value={to} />
                      <button
                        type="submit"
                        data-testid={to === 'pending_approval' ? `dpia-submit-${d.id}` : undefined}
                        className="rounded-md border border-border px-2 py-1 text-xs text-secondary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {to === 'pending_approval' ? t('submitApproval') : t(`st.${to}`)}
                      </button>
                    </form>
                  ))}
                  {d.status === 'pending_approval' && (
                    <form action={approveDpiaAction.bind(null, d.id)}>
                      <button
                        type="submit"
                        data-testid={`dpia-approve-${d.id}`}
                        className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {t('approve')}
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
