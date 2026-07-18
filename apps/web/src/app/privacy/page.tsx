import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { archiveRopaAction, createDpiaAction, createRopaAction, transitionDpiaAction } from './actions';

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
}
type DpiaStatus = 'draft' | 'in_progress' | 'completed';
interface Dpia {
  id: string;
  title: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: DpiaStatus;
  processingActivityId: string;
}

const LEGAL_BASES = ['consent', 'contract', 'legal_obligation', 'vital', 'public', 'legitimate'];
const ROLES = ['controller', 'processor', 'joint'];
const RISK_LEVELS = ['low', 'medium', 'high'];
const LVL_TONE: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};
const DPIA_NEXT: Record<DpiaStatus, DpiaStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
};

function resolveName(name: I18nText, locale: string): string {
  return (name as unknown as Record<string, string | undefined>)[locale] ?? name.en;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const btnCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Privacy — ROPA (T-074) + DPIA (T-075): реестр операций обработки + оценки влияния. */
export default async function PrivacyPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('privacy'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [ropaRes, dpiaRes] = await Promise.all([
    apiFetch('/processing-activities', { headers }),
    apiFetch('/processing-activities/dpia', { headers }),
  ]);
  const ropa: Ropa[] = ropaRes.ok ? await ropaRes.json() : [];
  const dpia: Dpia[] = dpiaRes.ok ? await dpiaRes.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      {/* ROPA */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('ropa')}</h2>
        <form action={createRopaAction} data-testid="ropa-create" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
          <input name="name" required placeholder={t('name')} className={`flex-1 ${inputCls}`} />
          <select name="legalBasis" defaultValue="consent" className={inputCls}>
            {LEGAL_BASES.map((b) => (
              <option key={b} value={b}>{t(`lb.${b}`)}</option>
            ))}
          </select>
          <select name="role" defaultValue="controller" className={inputCls}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{t(`rl.${r}`)}</option>
            ))}
          </select>
          <button type="submit" className={btnCls}>{t('add')}</button>
        </form>
        {ropa.length === 0 ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-secondary shadow-sm">{t('empty')}</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-white shadow-sm" data-testid="ropa-list">
            {ropa.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{resolveName(r.nameI18n, locale)}</span>
                  <span className="text-xs text-secondary">{t(`lb.${r.legalBasis}`)} · {t(`rl.${r.role}`)}</span>
                  {r.crossBorder && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{t('crossBorder')}</span>}
                </div>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary">{t(`st.${r.status}`)}</span>
                  {r.status === 'active' && (
                    <form action={archiveRopaAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-secondary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t('archive')}</button>
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
        <h2 className="text-sm font-semibold text-secondary">{t('dpia')}</h2>
        {ropa.length > 0 && (
          <form action={createDpiaAction} data-testid="dpia-create" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
            <select name="processingActivityId" className={inputCls} defaultValue={ropa[0]!.id}>
              {ropa.map((r) => (
                <option key={r.id} value={r.id}>{resolveName(r.nameI18n, locale)}</option>
              ))}
            </select>
            <input name="title" required placeholder={t('titlePh')} className={`flex-1 ${inputCls}`} />
            <select name="riskLevel" defaultValue="medium" className={inputCls}>
              {RISK_LEVELS.map((l) => (
                <option key={l} value={l}>{t(`lvl.${l}`)}</option>
              ))}
            </select>
            <button type="submit" className={btnCls}>{t('add')}</button>
          </form>
        )}
        {dpia.length === 0 ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-secondary shadow-sm">{t('empty')}</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-white shadow-sm" data-testid="dpia-list">
            {dpia.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{d.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LVL_TONE[d.riskLevel]}`}>{t(`lvl.${d.riskLevel}`)}</span>
                </div>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary">{t(`st.${d.status}`)}</span>
                  {DPIA_NEXT[d.status].map((to) => (
                    <form key={to} action={transitionDpiaAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="to" value={to} />
                      <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-secondary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t(`st.${to}`)}</button>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
