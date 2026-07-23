import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import {
  addQuestionAction,
  answerAction,
  submitQuestionnaireAction,
  updateQuestionnaireAction,
  useKbSuggestionAction,
} from './actions';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface Answer {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  reusedFromKb: boolean;
}
interface QuestionnaireDetail {
  id: string;
  title: string;
  source: string | null;
  status: 'draft' | 'submitted';
  ownerMembershipId: string | null;
  dueDate: string | null;
  answers: Answer[];
}
interface Suggestion {
  kbEntryId: string;
  kbQuestion: string;
  suggestedAnswer: string;
  score: number;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Опросник — детальная (T-083): ответы, добавить вопрос, submit. */
export default async function QuestionnaireDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, locale, { id }] = await Promise.all([
    getTranslations('questionnaires'),
    getActiveTenantSlug(),
    getLocale(),
    params,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch(`/questionnaires/${id}`, { headers });
  if (!res.ok) notFound();
  const q: QuestionnaireDetail = await res.json();
  const membersRes = await apiFetch(`/memberships?locale=${locale}`, { headers });
  const members: Array<{ id: string; fullName: string }> = membersRes.ok
    ? await membersRes.json()
    : [];
  const allAnswered = q.answers.length > 0 && q.answers.every((a) => a.answer);
  const isDraft = q.status === 'draft';

  // T-V42: детерминированные предложения ответов из KB (без LLM)
  const sRes = isDraft ? await apiFetch(`/questionnaires/${id}/suggestions`, { headers }) : null;
  const suggestions: Record<string, Suggestion> = sRes && sRes.ok ? await sRes.json() : {};

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-primary">{q.title}</h1>
          {q.source && <span className="text-sm text-secondary">{q.source}</span>}
        </div>
        <Link
          href="/questionnaires"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toList')}
        </Link>
      </div>

      <span
        className={`self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
          isDraft ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {t(`st.${q.status}`)}
      </span>

      <form
        action={updateQuestionnaireAction}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="id" value={q.id} />
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('owner')}
          <select
            name="ownerMembershipId"
            defaultValue={q.ownerMembershipId ?? ''}
            className={inputCls}
          >
            <option value="">—</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('due')}
          <input
            type="date"
            name="dueDate"
            defaultValue={q.dueDate?.slice(0, 10) ?? ''}
            className={inputCls}
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-secondary hover:bg-muted"
        >
          {t('save')}
        </button>
      </form>

      {/* Ответы */}
      <ul className="flex flex-col gap-3" data-testid="answers-list">
        {q.answers.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium text-foreground">{a.question}</span>
              {a.reusedFromKb && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                  {t('fromKb')}
                </span>
              )}
            </span>
            {a.answer ? (
              <p className="text-sm text-secondary">{a.answer}</p>
            ) : isDraft ? (
              <div className="flex flex-col gap-2">
                {suggestions[a.id] && (
                  <div
                    data-testid={`suggestion-${a.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2"
                  >
                    <span className="flex flex-col">
                      <span className="text-xs font-medium text-emerald-700">
                        {t('suggested')} · {t('match')} {Math.round(suggestions[a.id]!.score * 100)}
                        %
                      </span>
                      <span className="text-sm text-foreground">
                        {suggestions[a.id]!.suggestedAnswer}
                      </span>
                    </span>
                    <form
                      action={useKbSuggestionAction.bind(
                        null,
                        q.id,
                        a.id,
                        suggestions[a.id]!.kbEntryId,
                      )}
                    >
                      <button
                        type="submit"
                        data-testid={`use-suggestion-${a.id}`}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {t('useSuggestion')}
                      </button>
                    </form>
                  </div>
                )}
                <form action={answerAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="answerId" value={a.id} />
                  <input
                    name="answer"
                    required
                    placeholder={t('answerPh')}
                    className={`flex-1 ${inputCls}`}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-2 text-sm text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t('reply')}
                  </button>
                </form>
              </div>
            ) : (
              <p className="text-sm text-secondary italic">{t('noAnswer')}</p>
            )}
          </li>
        ))}
        {q.answers.length === 0 && (
          <li className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('noQuestions')} />
          </li>
        )}
      </ul>

      {isDraft && (
        <div className="flex flex-col gap-4">
          {/* Добавить вопрос */}
          <form
            action={addQuestionAction}
            data-testid="question-add"
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="id" value={q.id} />
            <input
              name="question"
              required
              placeholder={t('questionPh')}
              className={`flex-1 ${inputCls}`}
            />
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('addQuestion')}
            </button>
          </form>

          {/* Submit */}
          <form action={submitQuestionnaireAction} data-testid="questionnaire-submit">
            <input type="hidden" name="id" value={q.id} />
            <button
              type="submit"
              disabled={!allAnswered}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('submit')}
            </button>
            {!allAnswered && <span className="ml-2 text-xs text-secondary">{t('submitHint')}</span>}
          </form>
        </div>
      )}
    </main>
  );
}
