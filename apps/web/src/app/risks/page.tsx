import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import {
  addRiskFromLibraryAction,
  addRiskSuggestionAction,
  createRiskAction,
  setRiskMatrixAction,
} from './actions';
import { EmptyState } from '@/components/empty-state';
import { WidgetChart } from '@/components/widget-chart';
import { StatusBadge, type StatusTone } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
type Treatment = 'mitigate' | 'transfer' | 'accept' | 'avoid';
type BusinessCategory =
  'operational' | 'financial' | 'regulatory' | 'third_party' | 'continuity' | 'reputational';
interface Risk {
  id: string;
  title: string;
  domain: string | null;
  riskClass: RiskClass | null;
  residualClass: RiskClass | null;
  treatment: Treatment | null;
  status: string;
  approvalStatus: string | null;
}
interface RiskSuggestion {
  findingId: string;
  title: string;
  description: string;
  category: BusinessCategory;
  affectedProcess: string;
  affectedAsset: string;
  affectedControlRef: string | null;
  domain: string | null;
  inherentImpact: number;
  inherentLikelihood: number;
  riskClass: RiskClass | null;
  confidence: number;
  evidenceRef: { type: string; id: string; location: string };
  dedupe?: {
    fingerprint: string;
    status: 'new' | 'possible_duplicate';
    matchedRiskId: string | null;
    matchedTitle: string | null;
    reason: 'same_title' | 'same_category_domain' | null;
  };
}

const APPR_TONE: Record<string, StatusTone> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'critical',
};

const CLASS_TONE: Record<RiskClass, StatusTone> = {
  low: 'success',
  medium: 'warning',
  high: 'high',
  critical: 'critical',
};
const TREATMENTS: Treatment[] = ['mitigate', 'transfer', 'accept', 'avoid'];
const SCORES = [1, 2, 3, 4, 5];
const BUSINESS_CATEGORIES: BusinessCategory[] = [
  'operational',
  'financial',
  'regulatory',
  'third_party',
  'continuity',
  'reputational',
];

/** Реестр рисков (T-057): список + создание (impact×likelihood → risk_class). */
export default async function RisksPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('risks'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
  // T-V57: очередь «Требуют моего согласования»
  const approvalQueue = sp.queue === 'approval';

  const [res, matrixRes, libRes, suggestRes] = await Promise.all([
    apiFetch(`/risks?locale=${locale}${approvalQueue ? '&needsMyApproval=true' : ''}`, { headers }),
    apiFetch('/risks/matrix', { headers }),
    apiFetch(`/risks/library?locale=${locale}`, { headers }),
    apiFetch(`/risks/suggestions?locale=${locale}`, { headers }),
  ]);
  const risks: Risk[] = res.ok ? await res.json() : [];
  const library: Array<{
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    inherentImpact: number | null;
    inherentLikelihood: number | null;
    added: boolean;
  }> = libRes.ok ? await libRes.json() : [];
  const matrix: {
    impactScale: number;
    likelihoodScale: number;
    thresholds: { medium: number; high: number; critical: number };
  } = matrixRes.ok
    ? await matrixRes.json()
    : { impactScale: 5, likelihoodScale: 5, thresholds: { medium: 6, high: 12, critical: 20 } };
  const suggestions: {
    reviewRequired: boolean;
    count: number;
    duplicates?: number;
    items: RiskSuggestion[];
  } = suggestRes.ok ? await suggestRes.json() : { reviewRequired: true, count: 0, items: [] };

  // T-V59: Risk-Overview — распределение по treatment и по классу (донаты, WidgetChart)
  const tally = (fn: (r: Risk) => string | null) => {
    const acc: Record<string, number> = {};
    for (const r of risks) {
      const label = fn(r);
      if (label) acc[label] = (acc[label] ?? 0) + 1;
    }
    return acc;
  };
  const treatmentData = tally((r) => (r.treatment ? t(`tr.${r.treatment}`) : null));
  const classData = tally((r) => (r.riskClass ? t(`cls.${r.riskClass}`) : null));
  const categoryCounts = BUSINESS_CATEGORIES.map((category) => ({
    category,
    count: suggestions.items.filter((s) => s.category === category).length,
  })).filter((item) => item.count > 0);
  const mappedDomains = new Set(
    suggestions.items
      .map((s) => s.affectedProcess ?? s.domain ?? s.affectedControlRef)
      .filter(Boolean),
  ).size;
  const highConfidence = suggestions.items.filter((s) => s.confidence >= 0.75).length;
  const duplicateSuggestions =
    suggestions.duplicates ??
    suggestions.items.filter((s) => s.dedupe?.status === 'possible_duplicate').length;
  const classBadge = (c: RiskClass | null) =>
    c ? (
      <StatusBadge tone={CLASS_TONE[c]} dot>
        {t(`cls.${c}`)}
      </StatusBadge>
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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6 pt-10 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-accent uppercase">
            Risk intelligence
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t('title')}</h1>
        </div>
      </div>

      <form
        action={createRiskAction}
        data-testid="risk-create"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-white/90 p-5 shadow-sm"
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

      {!approvalQueue && risks.length > 0 && (
        <section
          className="grid gap-5 rounded-2xl border border-border bg-white/90 p-5 shadow-sm sm:grid-cols-2"
          data-testid="risk-overview"
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-primary">{t('byTreatment')}</h2>
            <WidgetChart chartType="donut" data={treatmentData} />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-primary">{t('byClass')}</h2>
            <WidgetChart chartType="donut" data={classData} />
          </div>
        </section>
      )}

      {!approvalQueue && suggestions.items.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-5 shadow-sm"
          data-testid="risk-ai-suggestions"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">
                {t('aiSuggestionsKicker')}
              </p>
              <h2 className="text-lg font-semibold text-primary">{t('aiSuggestions')}</h2>
              <p className="mt-1 text-sm text-secondary">{t('aiSuggestionsHint')}</p>
            </div>
            <StatusBadge tone="warning" dot>
              {t('reviewRequired')}
            </StatusBadge>
          </div>
          <div
            className="grid gap-3 rounded-2xl border border-emerald-200 bg-white/80 p-4 md:grid-cols-5"
            data-testid="business-risk-lens"
          >
            <div>
              <p className="text-xs font-medium text-secondary">{t('businessLens.draftQueue')}</p>
              <p className="mt-1 text-2xl font-bold text-primary">{suggestions.count}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-secondary">
                {t('businessLens.categoryCoverage')}
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">{categoryCounts.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-secondary">
                {t('businessLens.mappedDomains')}
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">{mappedDomains}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-secondary">{t('businessLens.dedupeGuard')}</p>
              <p className="mt-1 text-2xl font-bold text-primary">{duplicateSuggestions}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-secondary">
                {t('businessLens.highConfidence')}
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">{highConfidence}</p>
            </div>
            <div className="border-t border-emerald-100 pt-3 md:col-span-5">
              <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">
                {t('businessLens.title')}
              </p>
              <p className="mt-1 text-sm text-secondary">{t('businessLens.hint')}</p>
              {categoryCounts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {categoryCounts.map((item) => (
                    <span
                      key={item.category}
                      className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
                    >
                      {t(`businessCategories.${item.category}`)} · {item.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {suggestions.items.slice(0, 6).map((s) => {
              const duplicate = s.dedupe?.status === 'possible_duplicate' ? s.dedupe : null;
              return (
                <li
                  key={s.findingId}
                  className="rounded-xl border border-border bg-white/90 p-4 shadow-xs"
                  data-testid="risk-suggestion-dedupe-proof"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={s.riskClass ? CLASS_TONE[s.riskClass] : 'neutral'} dot>
                      {s.riskClass ? t(`cls.${s.riskClass}`) : '—'}
                    </StatusBadge>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                      {t(`businessCategories.${s.category}`)}
                    </span>
                    <span className="text-xs text-secondary">
                      {t('confidence')}: {Math.round(s.confidence * 100)}%
                    </span>
                    {duplicate && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {t('possibleDuplicate')}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-secondary">
                    {s.description}
                  </p>
                  <dl className="mt-3 grid gap-2 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-secondary">{t('affectedProcess')}</dt>
                      <dd className="mt-0.5 text-foreground">{s.affectedProcess}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-secondary">{t('affectedAsset')}</dt>
                      <dd className="mt-0.5 text-foreground">{s.affectedAsset}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-secondary">{t('controlClause')}</dt>
                      <dd className="mt-0.5 text-foreground">{s.affectedControlRef ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-secondary">{t('initialRating')}</dt>
                      <dd className="mt-0.5 text-foreground">
                        {s.inherentImpact}×{s.inherentLikelihood}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-secondary">{t('reviewGate')}</dt>
                      <dd className="mt-0.5 text-foreground">{t('draftOnly')}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="font-medium text-secondary">{t('evidence')}</dt>
                      <dd className="mt-0.5 text-foreground">{s.evidenceRef.location}</dd>
                    </div>
                    {duplicate && (
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-secondary">{t('dedupeMatch')}</dt>
                        <dd className="mt-0.5 text-foreground">
                          {duplicate.matchedTitle ?? t('inRegister')}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {duplicate?.matchedRiskId ? (
                    <Link
                      href={`/risks/${duplicate.matchedRiskId}`}
                      className="mt-3 inline-flex rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('openDuplicate')}
                    </Link>
                  ) : (
                    <form action={addRiskSuggestionAction} className="mt-3">
                      <input type="hidden" name="title" value={s.title} />
                      <input type="hidden" name="description" value={s.description} />
                      <input type="hidden" name="category" value={s.category} />
                      <input type="hidden" name="domain" value={s.affectedControlRef ?? ''} />
                      <input type="hidden" name="inherentImpact" value={s.inherentImpact} />
                      <input type="hidden" name="inherentLikelihood" value={s.inherentLikelihood} />
                      <input type="hidden" name="sourceFindingId" value={s.findingId} />
                      <input type="hidden" name="confidence" value={s.confidence} />
                      <input type="hidden" name="affectedProcess" value={s.affectedProcess} />
                      <input type="hidden" name="affectedAsset" value={s.affectedAsset} />
                      <input
                        type="hidden"
                        name="affectedControlRef"
                        value={s.affectedControlRef ?? ''}
                      />
                      <input type="hidden" name="evidenceType" value={s.evidenceRef.type} />
                      <input type="hidden" name="evidenceId" value={s.evidenceRef.id} />
                      <input type="hidden" name="evidenceLocation" value={s.evidenceRef.location} />
                      <input
                        type="hidden"
                        name="dedupeFingerprint"
                        value={s.dedupe?.fingerprint ?? ''}
                      />
                      <button
                        type="submit"
                        data-testid="risk-suggestion-add"
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {t('addAfterReview')}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <nav data-testid="risk-queue-tabs" className="flex gap-1.5">
        <Link
          href="/risks"
          className={
            'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
            (!approvalQueue
              ? 'bg-accent text-on-primary'
              : 'bg-muted text-secondary hover:bg-border')
          }
        >
          {t('tabAll')}
        </Link>
        <Link
          href="/risks?queue=approval"
          className={
            'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
            (approvalQueue
              ? 'bg-accent text-on-primary'
              : 'bg-muted text-secondary hover:bg-border')
          }
        >
          {t('needsMyApproval')}
        </Link>
      </nav>

      {risks.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={approvalQueue ? t('approvalQueueEmpty') : t('empty')} />
        </section>
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-border bg-white/90 shadow-sm">
          <table className="w-full text-left text-sm" data-testid="risks-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">{t('inherent')}</th>
                <th className="px-4 py-3 font-medium">{t('residual')}</th>
                <th className="px-4 py-3 font-medium">{t('treatment')}</th>
                <th className="px-4 py-3 font-medium">{t('status')}</th>
                <th className="px-4 py-3 font-medium">{t('approval')}</th>
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
                  <td className="px-4 py-3">
                    {r.approvalStatus ? (
                      <StatusBadge tone={APPR_TONE[r.approvalStatus] ?? 'neutral'} dot>
                        {t(`appr.${r.approvalStatus}`)}
                      </StatusBadge>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {library.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          data-testid="risk-library"
        >
          <h2 className="text-sm font-semibold text-primary">{t('library')}</h2>
          <p className="text-xs text-secondary">{t('libraryHint')}</p>
          <ul className="flex flex-col gap-2">
            {library.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{item.title}</span>
                    {item.category && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                        {item.category}
                      </span>
                    )}
                    {item.inherentImpact && item.inherentLikelihood && (
                      <span className="text-xs text-secondary tabular-nums">
                        {item.inherentImpact}×{item.inherentLikelihood}
                      </span>
                    )}
                  </span>
                  {item.description && (
                    <span className="text-xs text-secondary">{item.description}</span>
                  )}
                </span>
                {item.added ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    {t('inRegister')}
                  </span>
                ) : (
                  <form action={addRiskFromLibraryAction.bind(null, item.id)}>
                    <button
                      type="submit"
                      data-testid="library-add"
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('addToRegister')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
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
