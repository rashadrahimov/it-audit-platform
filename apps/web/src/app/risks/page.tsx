import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { createRiskAction } from './actions';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
type Treatment = 'mitigate' | 'transfer' | 'accept' | 'avoid';
interface Risk {
  id: string;
  title: string;
  domain: string | null;
  riskClass: RiskClass | null;
  residualClass: RiskClass | null;
  treatment: Treatment | null;
  status: string;
}

const CLASS_TONE: Record<RiskClass, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};
const TREATMENTS: Treatment[] = ['mitigate', 'transfer', 'accept', 'avoid'];
const SCORES = [1, 2, 3, 4, 5];

/** Реестр рисков (T-057): список + создание (impact×likelihood → risk_class). */
export default async function RisksPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('risks'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch(`/risks?locale=${locale}`, { headers });
  const risks: Risk[] = res.ok ? await res.json() : [];

  const classBadge = (c: RiskClass | null) =>
    c ? (
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASS_TONE[c]}`}>
        {t(`cls.${c}`)}
      </span>
    ) : (
      <span className="text-secondary">—</span>
    );

  const scoreSelect = (name: string, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-secondary">{label}</span>
      <select
        name={name}
        defaultValue="3"
        className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {SCORES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <form
        action={createRiskAction}
        data-testid="risk-create"
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{t('create')}</span>
          <input
            name="title"
            required
            placeholder={t('titlePh')}
            className="rounded-md border border-border px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          {scoreSelect('inherentImpact', `${t('inherent')} · ${t('impact')}`)}
          {scoreSelect('inherentLikelihood', `${t('inherent')} · ${t('likelihood')}`)}
          {scoreSelect('residualImpact', `${t('residual')} · ${t('impact')}`)}
          {scoreSelect('residualLikelihood', `${t('residual')} · ${t('likelihood')}`)}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('treatment')}</span>
            <select
              name="treatment"
              defaultValue="mitigate"
              className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {TREATMENTS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`tr.${tr}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('add')}
          </button>
        </div>
      </form>

      {risks.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="risks-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('inherent')}</th>
                <th className="px-4 py-3 font-medium">{t('residual')}</th>
                <th className="px-4 py-3 font-medium">{t('treatment')}</th>
                <th className="px-4 py-3 font-medium">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{r.title}</td>
                  <td className="px-4 py-3">{classBadge(r.riskClass)}</td>
                  <td className="px-4 py-3">{classBadge(r.residualClass)}</td>
                  <td className="px-4 py-3 text-secondary">
                    {r.treatment ? t(`tr.${r.treatment}`) : '—'}
                  </td>
                  <td className="px-4 py-3 text-secondary">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
