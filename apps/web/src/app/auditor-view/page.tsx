import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { RequestForm } from './request-form';
import { AssessmentForm } from './assessment-form';
import { setReviewStatusAction, acceptRequestAction } from './actions';

export const dynamic = 'force-dynamic';

interface Engagement {
  id: string;
  title: string;
}
interface EvidenceRequest {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
}
interface DocLink {
  linkId: string;
  filename: string;
  relation: string;
  reviewStatus: string;
}
interface Finding {
  id: string;
  title: string;
  riskRating: string;
}
interface Assessment {
  round: number;
  verdict: string;
  note: string | null;
  assessor: string | null;
}
interface Member {
  id: string;
  fullName: string;
  category: string;
}

const REVIEW_TONE: Record<string, string> = {
  not_ready: 'bg-muted text-secondary',
  ready: 'bg-sky-100 text-sky-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  flagged: 'bg-red-100 text-red-700',
  not_applicable: 'bg-slate-100 text-slate-700',
};
const REQ_TONE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-700',
  provided: 'bg-sky-100 text-sky-700',
  accepted: 'bg-emerald-100 text-emerald-700',
};
const VERDICT_TONE: Record<string, string> = {
  satisfactory: 'bg-emerald-100 text-emerald-700',
  exception: 'bg-red-100 text-red-700',
  not_applicable: 'bg-slate-100 text-slate-700',
};
const REVIEW_ACTIONS = ['accepted', 'flagged', 'not_applicable'] as const;
const VERDICTS = ['satisfactory', 'exception', 'not_applicable'] as const;

const pill = (text: string, tone: string) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}>
    {text}
  </span>
);
const btnCls =
  'cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export default async function AuditorViewPage({
  searchParams,
}: {
  searchParams: Promise<{ engagementId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, params] = await Promise.all([
    getTranslations('auditorView'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const eRes = await apiFetch(`/engagements?locale=${locale}`, { headers });
  const engagements: Engagement[] = eRes.ok ? await eRes.json() : [];
  const selectedId = params.engagementId ?? engagements[0]?.id;

  let requests: EvidenceRequest[] = [];
  let requestsOpen = 0;
  let docs: DocLink[] = [];
  let findings: (Finding & { assessments: Assessment[] })[] = [];
  let members: Member[] = [];

  if (selectedId) {
    const [reqRes, docRes, fRes, mRes] = await Promise.all([
      apiFetch(`/evidence-requests?engagementId=${selectedId}`, { headers }),
      apiFetch(`/documents?entityType=engagement&entityId=${selectedId}`, { headers }),
      apiFetch(`/findings?engagementId=${selectedId}&locale=${locale}`, { headers }),
      apiFetch('/memberships', { headers }),
    ]);
    if (reqRes.ok) {
      const body = (await reqRes.json()) as { open: number; items: EvidenceRequest[] };
      requests = body.items;
      requestsOpen = body.open;
    }
    if (docRes.ok) docs = await docRes.json();
    if (mRes.ok) members = await mRes.json();
    const baseFindings: Finding[] = fRes.ok ? await fRes.json() : [];
    findings = await Promise.all(
      baseFindings.map(async (f) => {
        const aRes = await apiFetch(`/auditor-assessments?targetType=finding&targetId=${f.id}`, {
          headers,
        });
        const assessments: Assessment[] = aRes.ok ? await aRes.json() : [];
        return { ...f, assessments };
      }),
    );
  }

  const assignees = members
    .filter((m) => m.category === 'respondent' || m.category === 'auditor')
    .map((m) => ({ id: m.id, name: m.fullName }));
  const verdictOptions = VERDICTS.map((v) => ({ value: v, label: t(`verdict.${v}`) }));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-secondary">{t('subtitle')}</p>
      </header>

      {engagements.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('noEngagements')} />
        </section>
      ) : (
        <>
          <div>
            <p className="mb-2 text-sm font-medium text-secondary">{t('selectEngagement')}</p>
            <div className="flex flex-wrap gap-2" data-testid="engagement-picker">
              {engagements.map((e) => {
                const active = e.id === selectedId;
                return (
                  <Link
                    key={e.id}
                    href={`/auditor-view?engagementId=${e.id}`}
                    className={`rounded-full px-3 py-1 text-sm transition-colors duration-150 ${
                      active
                        ? 'bg-accent text-on-primary'
                        : 'bg-muted text-secondary hover:bg-muted/70'
                    }`}
                  >
                    {e.title}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 1. Request list (PBC) */}
          <section className="flex flex-col gap-3" data-testid="request-list">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-secondary uppercase">
                {t('requestList')}
              </h2>
              {pill(t('openCount', { n: requestsOpen }), 'bg-amber-100 text-amber-700')}
            </div>
            {selectedId && (
              <RequestForm
                engagementId={selectedId}
                assignees={assignees}
                labels={{
                  title: t('reqTitle'),
                  titlePh: t('reqTitlePh'),
                  assignee: t('assignee'),
                  anyone: t('anyone'),
                  add: t('createRequest'),
                  ok: t('created'),
                  error: t('reqError'),
                }}
              />
            )}
            {requests.length === 0 ? (
              <div className="rounded-xl border border-border bg-white shadow-sm">
                <EmptyState size="sm" text={t('noRequests')} />
              </div>
            ) : (
              <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-secondary">
                      <th className="px-4 py-3 font-medium">{t('reqTitle')}</th>
                      <th className="px-4 py-3 font-medium">{t('assignee')}</th>
                      <th className="px-4 py-3 font-medium">{t('status')}</th>
                      <th className="px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{r.title}</td>
                        <td className="px-4 py-3 text-secondary">{r.assignee ?? '—'}</td>
                        <td className="px-4 py-3">
                          {pill(
                            t(`req.${r.status}`),
                            REQ_TONE[r.status] ?? 'bg-muted text-secondary',
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.status === 'provided' && (
                            <form action={acceptRequestAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <button type="submit" className={btnCls}>
                                {t('accept')}
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </section>

          {/* 2. Evidence tracker */}
          <section className="flex flex-col gap-3" data-testid="evidence-tracker">
            <h2 className="text-sm font-semibold tracking-wide text-secondary uppercase">
              {t('evidenceTracker')}
            </h2>
            {docs.length === 0 ? (
              <div className="rounded-xl border border-border bg-white shadow-sm">
                <EmptyState size="sm" text={t('noEvidence')} />
              </div>
            ) : (
              <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-secondary">
                      <th className="px-4 py-3 font-medium">{t('evidence')}</th>
                      <th className="px-4 py-3 font-medium">{t('reviewStatus')}</th>
                      <th className="px-4 py-3 font-medium">{t('setStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.linkId} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">{d.filename}</span>
                          <span className="ml-2 text-xs text-secondary">{d.relation}</span>
                        </td>
                        <td className="px-4 py-3">
                          {pill(
                            t(`rev.${d.reviewStatus}`),
                            REVIEW_TONE[d.reviewStatus] ?? 'bg-muted text-secondary',
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {REVIEW_ACTIONS.map((s) => (
                              <form key={s} action={setReviewStatusAction}>
                                <input type="hidden" name="linkId" value={d.linkId} />
                                <input type="hidden" name="reviewStatus" value={s} />
                                <button type="submit" className={btnCls}>
                                  {t(`rev.${s}`)}
                                </button>
                              </form>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </section>

          {/* 3. Auditor Assessment */}
          <section className="flex flex-col gap-3" data-testid="assessments">
            <h2 className="text-sm font-semibold tracking-wide text-secondary uppercase">
              {t('assessments')}
            </h2>
            {findings.length === 0 ? (
              <div className="rounded-xl border border-border bg-white shadow-sm">
                <EmptyState size="sm" text={t('noFindings')} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {findings.map((f) => {
                  const latest = f.assessments[f.assessments.length - 1];
                  return (
                    <article
                      key={f.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{f.title}</span>
                        <span className="flex items-center gap-2">
                          {latest
                            ? pill(
                                `${t(`verdict.${latest.verdict}`)} · ${t('round', { n: latest.round })}`,
                                VERDICT_TONE[latest.verdict] ?? 'bg-muted text-secondary',
                              )
                            : pill(t('notAssessed'), 'bg-muted text-secondary')}
                        </span>
                      </div>
                      {f.assessments.length > 0 && (
                        <ul className="flex flex-col gap-1 text-xs text-secondary">
                          {f.assessments.map((a, i) => (
                            <li key={i}>
                              {t('round', { n: a.round })}: {t(`verdict.${a.verdict}`)}
                              {a.note ? ` — ${a.note}` : ''}
                              {a.assessor ? ` (${a.assessor})` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                      <AssessmentForm
                        findingId={f.id}
                        verdicts={verdictOptions}
                        labels={{
                          notePh: t('notePh'),
                          add: t('addVerdict'),
                          error: t('assessError'),
                        }}
                      />
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
