import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface Hit {
  type: string;
  id: string;
  label: string;
  snippet?: string;
}
interface AuditQueryHit {
  id: string;
  title: string;
  riskRating: string;
  status: string;
  slaStatus: string;
  dueDate: string | null;
  engagementId: string | null;
  controlRef: string | null;
  checklistRef: string | null;
  snippet: string;
  reason: string;
}
interface AuditQueryEvidenceHit {
  id: string;
  filename: string;
  status: string;
  category: string | null;
  mime: string;
  extractionStatus?: string | null;
  entityType: string | null;
  entityId: string | null;
  relation: string | null;
  reviewStatus: string | null;
  reason: string;
}
interface AuditQueryAnswer {
  answer: string;
  count: number;
  evidenceCount?: number;
  totalCount?: number;
  interpreted: {
    riskRating: string | null;
    status: string | null;
    slaStatus: string | null;
    topic: string | null;
    terms: string[];
    confidence?: number;
    confidenceLevel?: 'low' | 'medium' | 'high';
    matchedSignals?: string[];
    deterministic?: boolean;
    evidenceGroundedOnly?: boolean;
  };
  hits: AuditQueryHit[];
  evidenceHits?: AuditQueryEvidenceHit[];
  suggestedQueries?: string[];
}

/** Куда ведёт хит каждого типа (T-V09; у WP/KB/программ пока нет detail-страниц — на разделы). */
const HREF: Record<string, (id: string) => string> = {
  finding: (id) => `/findings/${id}`,
  control: (id) => `/controls/${id}`,
  document: () => '/documents',
  working_paper: () => '/working-papers',
  kb_entry: () => '/knowledge-base',
  audit_program: () => '/audit-programs',
};
const TYPE_ORDER = ['finding', 'control', 'document', 'working_paper', 'kb_entry', 'audit_program'];

/** Результаты глобального поиска (T-V09 поверх GEN-05 T-094). */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, sp] = await Promise.all([
    getTranslations('search'),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const locale = await getCurrentLocale();
  if (!tenantSlug) redirect('/account');
  const q = (sp.q ?? '').trim();

  let hits: Hit[] = [];
  let ask: AuditQueryAnswer | null = null;
  if (q) {
    const [res, askRes] = await Promise.all([
      apiFetch(`/search?q=${encodeURIComponent(q)}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
      apiFetch(`/search/ask?q=${encodeURIComponent(q)}&locale=${locale}`, {
        headers: { 'X-Tenant-Slug': tenantSlug },
      }),
    ]);
    hits = res.ok ? ((await res.json()) as { hits: Hit[] }).hits : [];
    ask = askRes.ok ? ((await askRes.json()) as AuditQueryAnswer) : null;
  }
  const byType = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byType.get(h.type) ?? [];
    arr.push(h);
    byType.set(h.type, arr);
  }
  const dueDateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const formatDueDate = (value: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dueDateFormatter.format(date);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <h1 className="text-2xl font-bold text-primary">
        {t('title')}
        {q && <span className="ml-2 font-normal text-secondary">«{q}»</span>}
      </h1>
      {q && ask && (
        <section
          className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm"
          data-testid="audit-query-answer"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                {t('askKicker')}
              </p>
              <h2 className="text-sm font-semibold text-emerald-950">
                {(ask.totalCount ?? ask.count) === 0
                  ? t('askEmpty')
                  : t('askFound', {
                      findings: ask.count,
                      evidence: ask.evidenceCount ?? 0,
                      total: ask.totalCount ?? ask.count,
                    })}
              </h2>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
              {t('deterministic')}
              {typeof ask.interpreted.confidence === 'number'
                ? ` · ${t('confidence')}: ${Math.round(ask.interpreted.confidence * 100)}%`
                : null}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            {ask.interpreted.riskRating && (
              <span className="rounded-full bg-white px-2 py-1 text-emerald-800">
                {t('risk')}: {ask.interpreted.riskRating}
              </span>
            )}
            {ask.interpreted.status && (
              <span className="rounded-full bg-white px-2 py-1 text-emerald-800">
                {t('status')}: {ask.interpreted.status}
              </span>
            )}
            {ask.interpreted.slaStatus && (
              <span className="rounded-full bg-white px-2 py-1 text-emerald-800">
                {t('sla')}: {ask.interpreted.slaStatus}
              </span>
            )}
            {ask.interpreted.topic && (
              <span className="rounded-full bg-white px-2 py-1 text-emerald-800">
                {t('topic')}: {ask.interpreted.topic}
              </span>
            )}
            {ask.interpreted.confidenceLevel && (
              <span className="rounded-full bg-white px-2 py-1 text-emerald-800">
                {t('confidenceLevel')}: {t(`confidenceLevels.${ask.interpreted.confidenceLevel}`)}
              </span>
            )}
          </div>
          {(ask.interpreted.matchedSignals?.length ?? 0) > 0 && (
            <p className="mb-3 text-xs text-emerald-800" data-testid="audit-query-explanation">
              {t('interpretedAs', { signals: ask.interpreted.matchedSignals!.join(' · ') })}
            </p>
          )}
          {ask.hits.length > 0 && (
            <ul className="grid gap-2">
              {ask.hits.map((h) => (
                <li key={h.id} className="rounded-xl border border-emerald-200/80 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/findings/${h.id}`}
                      className="font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {h.title}
                    </Link>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-secondary">
                      {h.riskRating}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-secondary">
                      {h.status}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      {t('sla')}: {h.slaStatus}
                    </span>
                    {h.dueDate && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        {t('due')}: {formatDueDate(h.dueDate)}
                      </span>
                    )}
                    {(h.controlRef || h.checklistRef) && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        {h.controlRef ?? h.checklistRef}
                      </span>
                    )}
                  </div>
                  {h.snippet && <p className="mt-1 text-sm text-secondary">{h.snippet}</p>}
                  <p className="mt-1 text-xs text-emerald-700">{h.reason}</p>
                </li>
              ))}
            </ul>
          )}
          {(ask.evidenceHits?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-xl border border-emerald-200/80 bg-white/80 p-3">
              <p className="text-xs font-semibold text-emerald-900">
                {t('askEvidenceFound', { n: ask.evidenceHits!.length })}
              </p>
              <ul className="mt-2 grid gap-2">
                {ask.evidenceHits!.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href="/documents"
                        className="font-medium text-accent underline-offset-2 hover:underline"
                      >
                        {h.filename}
                      </Link>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-secondary">
                        {h.category ?? h.mime}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-secondary">
                        {h.reviewStatus ?? h.status}
                      </span>
                      {h.extractionStatus && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          {h.extractionStatus === 'indexed'
                            ? t('contentIndexed')
                            : t('contentPending')}
                        </span>
                      )}
                      {h.entityType && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          {h.entityType}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-emerald-700">{h.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {!q ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">{t('hint')}</p>
          <section
            className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
            data-testid="audit-query-examples"
          >
            <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">
              {t('examplesKicker')}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-emerald-950">{t('examplesTitle')}</h2>
            <p className="mt-1 text-xs text-secondary">{t('examplesHint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                ask?.suggestedQueries ?? [
                  t('examples.criticalAccess'),
                  t('examples.backupEvidence'),
                  t('examples.vendorRisk'),
                ]
              ).map((example) => (
                <Link
                  key={example}
                  href={`/search?q=${encodeURIComponent(example)}&locale=${locale}`}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs transition-colors hover:bg-emerald-100"
                >
                  {example}
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : hits.length === 0 ? (
        <EmptyState text={t('empty')} />
      ) : (
        <div className="flex flex-col gap-5" data-testid="search-results">
          {TYPE_ORDER.filter((type) => byType.has(type)).map((type) => (
            <section key={type} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-primary">
                {t(`types.${type}`)}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary tabular-nums">
                  {byType.get(type)!.length}
                </span>
              </h2>
              <ul className="flex flex-col gap-1.5">
                {byType.get(type)!.map((h) => (
                  <li key={h.id} className="text-sm">
                    <Link
                      href={HREF[h.type]?.(h.id) ?? '/account'}
                      className="font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {h.label}
                    </Link>
                    {h.snippet && <span className="ml-2 text-secondary">{h.snippet}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
