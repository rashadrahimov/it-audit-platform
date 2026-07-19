import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { createAnnotationAction, deleteAnnotationAction, resolveAnnotationAction } from './actions';

export const dynamic = 'force-dynamic';

interface Engagement {
  id: string;
  title: string;
  subsidiary: string;
}
type WpStatus = 'draft' | 'prepared' | 'in_review' | 'reviewed' | 'signed_off';
interface WorkingPaper {
  id: string;
  title: string;
  status: WpStatus;
  editedSinceReview: boolean;
}
type AnnKind = 'comment' | 'tick_mark' | 'exception';
interface Annotation {
  id: string;
  kind: AnnKind;
  anchor: string | null;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}
interface ExceptionReport {
  total: number;
  open: number;
  exceptions: Array<{
    id: string;
    workingPaperTitle: string;
    anchor: string | null;
    body: string;
    resolvedAt: string | null;
    createdAt: string;
  }>;
}

const STATUS_TONE: Record<WpStatus, string> = {
  draft: 'bg-muted text-secondary',
  prepared: 'bg-sky-100 text-sky-700',
  in_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-indigo-100 text-indigo-700',
  signed_off: 'bg-emerald-100 text-emerald-700',
};
const KIND_TONE: Record<AnnKind, string> = {
  comment: 'bg-muted text-secondary',
  tick_mark: 'bg-sky-100 text-sky-700',
  exception: 'bg-red-100 text-red-700',
};
const KINDS: AnnKind[] = ['comment', 'tick_mark', 'exception'];

const inputCls =
  'rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const smallBtn =
  'rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Working papers (T-092 → T-V14): WP workflow + аннотации + exception-report. */
export default async function WorkingPapersPage({
  searchParams,
}: {
  searchParams: Promise<{ engagementId?: string; paperId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, uiLocale, tenantSlug, params] = await Promise.all([
    getTranslations('workingPapers'),
    getCurrentLocale(),
    getLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const eRes = await apiFetch(`/engagements?locale=${locale}`, { headers });
  const engagements: Engagement[] = eRes.ok ? await eRes.json() : [];
  const selectedId = params.engagementId ?? engagements[0]?.id;

  let papers: WorkingPaper[] = [];
  let report: ExceptionReport | null = null;
  if (selectedId) {
    const [wRes, xRes] = await Promise.all([
      apiFetch(`/working-papers?engagementId=${selectedId}`, { headers }),
      apiFetch(`/annotations/exception-report?engagementId=${selectedId}`, { headers }),
    ]);
    if (wRes.ok) papers = await wRes.json();
    if (xRes.ok) report = await xRes.json();
  }

  const selectedPaperId =
    params.paperId && papers.some((p) => p.id === params.paperId) ? params.paperId : undefined;
  let annotations: Annotation[] = [];
  if (selectedPaperId) {
    const aRes = await apiFetch(`/annotations?workingPaperId=${selectedPaperId}`, { headers });
    if (aRes.ok) annotations = await aRes.json();
  }
  const selectedPaper = papers.find((p) => p.id === selectedPaperId);
  const dateTimeFmt = new Intl.DateTimeFormat(uiLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

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
                    href={`/working-papers?engagementId=${e.id}`}
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

          <section
            className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            data-testid="working-papers"
          >
            {papers.length === 0 ? (
              <EmptyState size="sm" text={t('empty')} />
            ) : (
              <ul>
                {papers.map((wp) => (
                  <li
                    key={wp.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
                  >
                    <Link
                      href={`/working-papers?engagementId=${selectedId}&paperId=${wp.id}`}
                      className="font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                    >
                      {wp.title}
                    </Link>
                    <span className="flex items-center gap-2">
                      {wp.editedSinceReview && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {t('editedSinceReview')}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[wp.status]}`}
                      >
                        {t(`status.${wp.status}`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selectedPaper && (
            <section
              className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
              data-testid="wp-annotations"
            >
              <h2 className="text-sm font-semibold text-primary">
                {t('annotations')} · {selectedPaper.title}
              </h2>
              {annotations.length === 0 ? (
                <p className="text-sm text-secondary">{t('noAnnotations')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm" data-testid="annotations-table">
                    <thead>
                      <tr className="border-b border-border text-secondary">
                        <th className="px-3 py-2 font-medium">{t('kind')}</th>
                        <th className="px-3 py-2 font-medium">{t('anchor')}</th>
                        <th className="px-3 py-2 font-medium">{t('body')}</th>
                        <th className="px-3 py-2 font-medium">{t('createdAt')}</th>
                        <th className="px-3 py-2 font-medium">{t('state')}</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {annotations.map((a) => (
                        <tr key={a.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${KIND_TONE[a.kind]}`}
                            >
                              {t(`k.${a.kind}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-secondary">{a.anchor ?? '—'}</td>
                          <td className="px-3 py-2 text-foreground">{a.body}</td>
                          <td className="px-3 py-2 text-secondary tabular-nums">
                            {dateTimeFmt.format(new Date(a.createdAt))}
                          </td>
                          <td className="px-3 py-2">
                            {a.resolvedAt ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                {t('resolved')}
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                                {t('openState')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex gap-1.5">
                              {!a.resolvedAt && (
                                <form action={resolveAnnotationAction.bind(null, a.id)}>
                                  <button
                                    type="submit"
                                    className={smallBtn}
                                    data-testid="annotation-resolve"
                                  >
                                    {t('resolve')}
                                  </button>
                                </form>
                              )}
                              <form action={deleteAnnotationAction.bind(null, a.id)}>
                                <button
                                  type="submit"
                                  className={smallBtn}
                                  data-testid="annotation-delete"
                                >
                                  {t('delete')}
                                </button>
                              </form>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <form
                action={createAnnotationAction.bind(null, selectedPaper.id)}
                className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
                data-testid="annotation-create"
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-secondary">{t('kind')}</span>
                  <select name="kind" defaultValue="comment" className={inputCls}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`k.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-secondary">{t('anchor')}</span>
                  <input name="anchor" placeholder={t('anchorPh')} className={inputCls} />
                </label>
                <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-secondary">{t('body')}</span>
                  <input name="body" required placeholder={t('bodyPh')} className={inputCls} />
                </label>
                <button
                  type="submit"
                  data-testid="annotation-add"
                  className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t('add')}
                </button>
              </form>
            </section>
          )}

          {report && (
            <section
              className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
              data-testid="exception-report"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold text-primary">{t('exceptionReport')}</h2>
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 tabular-nums">
                  {t('openCount', { n: report.open })}
                </span>
                <span className="text-xs text-secondary tabular-nums">
                  {t('totalCount', { n: report.total })}
                </span>
              </div>
              {report.exceptions.length === 0 ? (
                <p className="text-sm text-secondary">{t('noExceptions')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {report.exceptions.map((x) => (
                    <li
                      key={x.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium text-foreground">{x.workingPaperTitle}</span>
                        {x.anchor && (
                          <span className="ml-2 text-xs text-secondary">{x.anchor}</span>
                        )}
                        <span className="ml-2 text-foreground">{x.body}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {x.resolvedAt ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {t('resolved')}
                          </span>
                        ) : (
                          <form action={resolveAnnotationAction.bind(null, x.id)}>
                            <button
                              type="submit"
                              className={smallBtn}
                              data-testid="exception-resolve"
                            >
                              {t('resolve')}
                            </button>
                          </form>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
