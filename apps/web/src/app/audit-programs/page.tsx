import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { resolveLocalized, type I18nText } from '@it-audit/shared';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { createProgramAction, rollForwardAction } from './actions';

export const dynamic = 'force-dynamic';

interface Program {
  id: string;
  titleI18n: I18nText;
  subjectArea: string | null;
  engagementId: string | null;
  originProgramId: string | null;
}
interface Engagement {
  id: string;
  title: string;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Audit programs (T-093): создание с шагами + roll-forward в другой engagement. */
export default async function AuditProgramsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, locale] = await Promise.all([
    getTranslations('auditPrograms'),
    getActiveTenantSlug(),
    getCurrentLocale(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [progRes, engRes] = await Promise.all([
    apiFetch('/audit-programs', { headers }),
    apiFetch('/engagements', { headers }),
  ]);
  const programs: Program[] = progRes.ok ? await progRes.json() : [];
  const engagements: Engagement[] = engRes.ok ? await engRes.json() : [];
  const engById = new Map(engagements.map((e) => [e.id, e.title]));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      {/* Создание программы */}
      <form action={createProgramAction} data-testid="program-create" className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <input name="title" required placeholder={t('namePh')} className={`flex-1 ${inputCls}`} />
          <input name="subjectArea" placeholder={t('subjectArea')} className={inputCls} />
          <select name="engagementId" defaultValue="" className={inputCls}>
            <option value="">{t('noEngagement')}</option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <input name="step1" placeholder={`${t('step')} 1`} className={`flex-1 ${inputCls}`} />
          <input name="step2" placeholder={`${t('step')} 2`} className={`flex-1 ${inputCls}`} />
          <input name="step3" placeholder={`${t('step')} 3`} className={`flex-1 ${inputCls}`} />
        </div>
        <button
          type="submit"
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {programs.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">{t('empty')}</section>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="programs-list">
          {programs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{resolveLocalized(p.titleI18n, locale)}</span>
                  {p.subjectArea && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-secondary">{p.subjectArea}</span>
                  )}
                  {p.originProgramId && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">{t('rolled')}</span>
                  )}
                </span>
                {p.engagementId && (
                  <span className="text-xs text-secondary">{engById.get(p.engagementId) ?? p.engagementId}</span>
                )}
              </div>
              <form action={rollForwardAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <select name="targetEngagementId" defaultValue="" required className={`${inputCls} px-2 py-1 text-xs`}>
                  <option value="" disabled>{t('rollTarget')}</option>
                  {engagements.map((e) => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t('rollForward')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
