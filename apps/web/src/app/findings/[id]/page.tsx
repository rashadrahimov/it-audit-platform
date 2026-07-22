import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { TasksSection, type TaskItem } from '@/components/tasks-section';
import { TagsSection } from '@/components/tags-section';
import {
  addFindingCommentAction,
  assignFindingAction,
  retestFindingAction,
  transitionFindingAction,
} from '../actions';

export const dynamic = 'force-dynamic';

interface FindingDetail {
  id: string;
  title: string;
  description: string | null;
  recommendation: string | null;
  riskRating: string;
  status: string;
  slaStatus: string | null;
  dueDate: string | null;
  engagementId: string | null;
  owner: string | null;
  auditor: string | null;
  managementResponse: string | null;
  remediatedAt: string | null;
  retestResult: string | null;
  resolutionDate: string | null;
  allowedNext: string | null;
  aiReview: {
    source: 'finding_suggestion';
    decision: 'accepted';
    confidence: number;
    expected: string;
    observed: string;
    reason?: string;
    controlClause?: string;
    riskJustification?: string;
    evidenceReferences: Array<{
      documentId: string;
      filename: string;
      relation: string;
      location: string;
    }>;
    reviewedAt: string;
    reviewedBy: string;
  } | null;
  history: Array<{ action: string; actor: string | null; at: string }>;
  comments: Array<{ author: string; body: string; at: string }>;
}

interface Member {
  id: string;
  fullName: string;
  role: string;
}

const RATING_TONE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
  not_applicable: 'bg-muted text-secondary',
};
const SLA_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

const actionBtn =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const secondaryBtn =
  'rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Карточка finding (T-V03): поля + lifecycle-кнопки + assign + история + комментарии. */
export default async function FindingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, { id }] = await Promise.all([
    getTranslations('findings'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    params,
  ]);
  if (!tenantSlug) redirect('/account');

  const headers = { 'X-Tenant-Slug': tenantSlug };
  const res = await apiFetch(`/findings/${id}?locale=${locale}`, { headers });
  if (!res.ok) redirect('/findings');
  const f: FindingDetail = await res.json();
  f.comments ??= [];
  f.history ??= [];

  // список участников для assign-формы; у не-админа (403) — форма скрыта
  const [mRes, tasksRes, tagsOfRes, allTagsRes] = await Promise.all([
    apiFetch(`/memberships?locale=${locale}`, { headers }),
    apiFetch(`/tasks?entityType=finding&entityId=${id}&locale=${locale}`, { headers }),
    apiFetch(`/tags/of?entityType=finding&entityId=${id}`, { headers }),
    apiFetch('/tags', { headers }),
  ]);
  const members: Member[] = mRes.ok ? await mRes.json() : [];
  const tasks: TaskItem[] = tasksRes.ok ? await tasksRes.json() : [];
  const currentTags = tagsOfRes.ok ? await tagsOfRes.json() : [];
  const allTags = allTagsRes.ok ? await allTagsRes.json() : [];

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const fields: Array<[string, string | null]> = [
    [t('description'), f.description],
    [t('recommendation'), f.recommendation],
    [t('managementResponse'), f.managementResponse],
    [t('colOwner'), f.owner],
    [t('auditor'), f.auditor],
    [t('colDue'), f.dueDate ? dateFmt.format(new Date(f.dueDate)) : null],
    [t('remediatedAt'), f.remediatedAt ? dateFmt.format(new Date(f.remediatedAt)) : null],
    [t('retestResult'), f.retestResult],
    [t('resolution'), f.resolutionDate ? dateFmt.format(new Date(f.resolutionDate)) : null],
  ];
  const aiControlClause = f.aiReview?.controlClause ?? t('aiControlClauseFallback');
  const aiReasoning = f.aiReview?.reason ?? t('aiReasoningFallback');
  const aiRiskJustification =
    f.aiReview?.riskJustification ??
    t('aiRiskJustificationFallback', { risk: t(`ratings.${f.riskRating}`) });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div>
        <Link
          href="/findings"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          ← {t('back')}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3" data-testid="finding-header">
        <h1 className="text-2xl font-bold text-primary">{f.title}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RATING_TONE[f.riskRating] ?? 'bg-muted text-secondary'}`}
        >
          {t(`ratings.${f.riskRating}`)}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
          {t(`statuses.${f.status}`)}
        </span>
        {f.slaStatus && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SLA_TONE[f.slaStatus] ?? 'bg-muted text-secondary'}`}
          >
            {t(`slas.${f.slaStatus}`)}
          </span>
        )}
        {f.aiReview && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            {t('aiAccepted')} · {Math.round(f.aiReview.confidence * 100)}%
          </span>
        )}
      </header>

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="finding-fields"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-secondary">{label}</dt>
              <dd className="text-sm text-foreground">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {f.aiReview && (
        <section
          className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm"
          data-testid="finding-ai-review"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                {t('aiTrailKicker')}
              </p>
              <h2 className="text-sm font-semibold text-emerald-950">{t('aiTrailTitle')}</h2>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
              {t('humanAccepted')}
            </span>
          </div>
          <dl className="grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded-lg bg-white/80 p-3">
              <dt className="font-semibold text-secondary">{t('aiExpected')}</dt>
              <dd className="mt-1 text-foreground">{f.aiReview.expected}</dd>
            </div>
            <div className="rounded-lg bg-white/80 p-3">
              <dt className="font-semibold text-secondary">{t('aiObserved')}</dt>
              <dd className="mt-1 text-foreground">{f.aiReview.observed}</dd>
            </div>
          </dl>
          <div
            className="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-3"
            data-testid="finding-ai-explainability"
          >
            <p className="text-xs font-semibold tracking-[0.12em] text-emerald-700 uppercase">
              {t('aiExplainabilityKicker')}
            </p>
            <dl className="mt-2 grid gap-2 text-xs md:grid-cols-3">
              <div>
                <dt className="font-semibold text-secondary">{t('aiControlClause')}</dt>
                <dd className="mt-1 text-foreground">{aiControlClause}</dd>
              </div>
              <div>
                <dt className="font-semibold text-secondary">{t('aiReasoning')}</dt>
                <dd className="mt-1 text-foreground">{aiReasoning}</dd>
              </div>
              <div>
                <dt className="font-semibold text-secondary">{t('aiRiskJustification')}</dt>
                <dd className="mt-1 text-foreground">{aiRiskJustification}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {f.aiReview.evidenceReferences.length > 0 ? (
              f.aiReview.evidenceReferences.map((ev) => (
                <span
                  key={`${ev.documentId}-${ev.location}`}
                  className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-emerald-800"
                >
                  {ev.filename} · {ev.location}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
                {t('aiNoEvidence')}
              </span>
            )}
          </div>
        </section>
      )}

      <section
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="finding-actions"
      >
        <span className="text-sm font-medium text-secondary">{t('actions')}:</span>
        {f.status === 'pending_retest' ? (
          <>
            <form action={retestFindingAction.bind(null, f.id, 'passed')}>
              <button type="submit" className={actionBtn} data-testid="finding-retest-passed">
                {t('retestPassed')}
              </button>
            </form>
            <form action={retestFindingAction.bind(null, f.id, 'failed')}>
              <button type="submit" className={secondaryBtn} data-testid="finding-retest-failed">
                {t('retestFailed')}
              </button>
            </form>
          </>
        ) : f.allowedNext ? (
          <form action={transitionFindingAction.bind(null, f.id, f.allowedNext)}>
            <button type="submit" className={actionBtn} data-testid="finding-transition">
              {t('advance', { status: t(`statuses.${f.allowedNext}`) })}
            </button>
          </form>
        ) : (
          <span className="text-sm text-secondary">—</span>
        )}
        {members.length > 0 && f.status !== 'closed' && (
          <form
            action={assignFindingAction.bind(null, f.id)}
            className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center"
            data-testid="finding-assign"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-secondary sm:flex-row sm:items-center">
              {t('assignTitle')}
              <select
                name="ownerMembershipId"
                required
                className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} · {m.role}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={`${secondaryBtn} w-full sm:w-auto`}>
              {t('assignBtn')}
            </button>
          </form>
        )}
      </section>

      <TagsSection
        entityType="finding"
        entityId={id}
        path={`/findings/${id}`}
        current={currentTags}
        all={allTags}
        testid="finding-tags"
        labels={{
          title: t('tagsTitle'),
          add: t('tagAdd'),
          none: t('tagNone'),
          attach: t('tagAttach'),
        }}
      />

      <TasksSection
        entityType="finding"
        entityId={f.id}
        path={`/findings/${f.id}`}
        tasks={tasks}
        members={members}
        testid="finding-tasks"
        title={t('tasks')}
      />

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="finding-comments"
      >
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('comments')}</h2>
        {f.comments.length === 0 ? (
          <p className="text-sm text-secondary">{t('commentsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {f.comments.map((c, i) => (
              <li key={i} className="rounded-lg bg-muted/60 p-3 text-sm">
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{c.author}</span>
                  <span className="text-xs text-secondary tabular-nums">
                    {dateTimeFmt.format(new Date(c.at))}
                  </span>
                </div>
                <p className="text-foreground">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          action={addFindingCommentAction.bind(null, f.id)}
          className="mt-3 flex items-start gap-2"
        >
          <textarea
            name="body"
            required
            rows={2}
            placeholder={t('commentPh')}
            className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground"
          />
          <button type="submit" className={secondaryBtn} data-testid="finding-comment-add">
            {t('commentAdd')}
          </button>
        </form>
      </section>

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="finding-history"
      >
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('history')}</h2>
        {f.history.length === 0 ? (
          <p className="text-sm text-secondary">{t('historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {f.history.map((h, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{h.action}</code>
                  {h.actor && <span className="ml-2 text-secondary">{h.actor}</span>}
                </span>
                <span className="text-xs text-secondary tabular-nums">
                  {dateTimeFmt.format(new Date(h.at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
