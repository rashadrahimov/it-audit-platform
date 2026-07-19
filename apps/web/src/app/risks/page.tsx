import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { createRiskAction, setRiskMatrixAction } from './actions';
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

  const [res, matrixRes] = await Promise.all([
    apiFetch(`/risks?locale=${locale}`, { headers }),
    apiFetch('/risks/matrix', { headers }),
  ]);
  const risks: Risk[] = res.ok ? await res.json() : [];
  const matrix: {
    impactScale: number;
    likelihoodScale: number;
    thresholds: { medium: number; high: number; critical: number };
  } = matrixRes.ok
    ? await matrixRes.json()
    : { impactScale: 5, likelihoodScale: 5, thresholds: { medium: 6, high: 12, critical: 20 } };

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
                  <td className="px-4 py-3">
                    <Link
                      href={`/risks/${r.id}`}
                      className="font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{classBadge(r.riskClass)}</td>
                  <td className="px-4 py-3">{classBadge(r.residualClass)}</td>
                  <td className="px-4 py-3 text-secondary">
                    {r.treatment ? t(`tr.${r.treatment}`) : '—'}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {['open', 'in_progress', 'closed'].includes(r.status)
                      ? t(`st.${r.status}`)
                      : r.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="risk-matrix-settings"
      >
        <h2 className="text-sm font-semibold text-primary">{t('matrix')}</h2>
        <p className="text-xs text-secondary">{t('matrixHint')}</p>
        <form action={setRiskMatrixAction} className="flex flex-wrap items-end gap-3">
          {(
            [
              ['impactScale', t('impact'), matrix.impactScale, 3, 10],
              ['likelihoodScale', t('likelihood'), matrix.likelihoodScale, 3, 10],
              ['medium', t('cls.medium'), matrix.thresholds.medium, 1, 100],
              ['high', t('cls.high'), matrix.thresholds.high, 1, 100],
              ['critical', t('cls.critical'), matrix.thresholds.critical, 1, 100],
            ] as Array<[string, string, number, number, number]>
          ).map(([name, label, value, min, max]) => (
            <label key={name} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{label}</span>
              <input
                type="number"
                name={name}
                defaultValue={value}
                min={min}
                max={max}
                className="w-24 rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </label>
          ))}
          <button
            type="submit"
            data-testid="matrix-save"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('saveMatrix')}
          </button>
        </form>
      </section>
    </main>
  );
}
