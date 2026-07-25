import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { TagsSection } from '@/components/tags-section';
import {
  addIncidentEventAction,
  assignIncidentAction,
  linkIncidentAction,
  notifyRegulatorAction,
  savePostmortemAction,
  setReportableAction,
  transitionIncidentAction,
  unlinkIncidentAction,
} from '../actions';
import {
  btnCls,
  btnGhostCls,
  inputCls,
  LINK_TYPES,
  NOTIFY_TONE,
  SEV_TONE,
  SLA_TONE,
  STATUS_TONE,
  STATUSES,
  type IncidentDetail,
} from '../shared';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  fullName: string | null;
  email: string;
}

const PHASE_KEY: Record<string, string> = {
  detected: 'detectedAt',
  triaged: 'triagedAt',
  contained: 'containedAt',
  eradicated: 'eradicatedAt',
  recovered: 'recoveredAt',
  closed: 'closedAt',
};

/** Карточка инцидента (T-IR06): фазы, таймлайн, связи, постмортем, срок уведомления. */
export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [{ id }, t, locale, tenantSlug] = await Promise.all([
    params,
    getTranslations('incidents'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const [res, membersRes, tagsOfRes, allTagsRes, docsRes] = await Promise.all([
    apiFetch(`/incidents/${id}?locale=${locale}`, { headers }),
    apiFetch('/memberships', { headers }),
    apiFetch(`/tags/of?entityType=incident&entityId=${id}`, { headers }),
    apiFetch('/tags', { headers }),
    apiFetch(`/documents?entityType=incident&entityId=${id}`, { headers }),
  ]);
  if (!res.ok) notFound();
  const inc: IncidentDetail = await res.json();
  const members: Member[] = membersRes.ok ? await membersRes.json() : [];
  const currentTags = tagsOfRes.ok ? await tagsOfRes.json() : [];
  const allTags = allTagsRes.ok ? await allTagsRes.json() : [];
  // T-IR08: доказательства инцидента (логи, переписка, форма уведомления регулятора)
  const documents: Array<{ id: string; filename: string }> = docsRes.ok ? await docsRes.json() : [];

  const dtFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const badge = (tone: string) => `rounded-full px-2 py-0.5 text-xs font-medium ${tone}`;
  const card = 'rounded-xl border border-border bg-white p-5 shadow-sm';
  const label = 'text-xs font-semibold tracking-wide text-secondary uppercase';

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex flex-col gap-2">
        <Link href="/incidents" className="text-sm text-accent hover:underline">
          ← {t('title')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-primary" data-testid="incident-title">
            <span className="tabular-nums text-secondary">{inc.ref}</span> {inc.title}
          </h1>
          <span className={badge(SEV_TONE[inc.severity])}>{t(`sev.${inc.severity}`)}</span>
          <span className={badge(STATUS_TONE[inc.status])}>{t(`st.${inc.status}`)}</span>
          <span className={badge(SLA_TONE[inc.slaStatus] ?? 'bg-muted text-secondary')}>
            {t(`sla.${inc.slaStatus}`)}
          </span>
        </div>
        {inc.description && <p className="text-sm text-secondary">{inc.description}</p>}
      </div>

      {/* Фазы реагирования: где мы сейчас и что уже пройдено */}
      <section className={card} data-testid="incident-phases">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('phases')}</h2>
        <ol className="flex flex-wrap gap-2">
          {STATUSES.map((s) => {
            const at = inc.phases[PHASE_KEY[s]!];
            return (
              <li
                key={s}
                className={`flex min-w-32 flex-col gap-0.5 rounded-lg border px-3 py-2 ${
                  at ? 'border-accent/40 bg-accent-soft' : 'border-border bg-muted/40'
                }`}
              >
                <span className="text-xs font-semibold text-primary">{t(`st.${s}`)}</span>
                <span className="text-[11px] tabular-nums text-secondary">
                  {at ? dtFmt.format(new Date(at)) : '—'}
                </span>
              </li>
            );
          })}
        </ol>
        {inc.allowedTransitions.length > 0 && (
          <form
            action={transitionIncidentAction}
            data-testid="incident-transition"
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4"
          >
            <input type="hidden" name="id" value={inc.id} />
            <label className="flex flex-col gap-1">
              <span className={label}>{t('nextPhase')}</span>
              <select name="to" className={inputCls} defaultValue={inc.allowedTransitions[0]}>
                {inc.allowedTransitions.map((s) => (
                  <option key={s} value={s}>
                    {t(`st.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <input name="note" placeholder={t('notePh')} className={`flex-1 ${inputCls}`} />
            <button type="submit" className={btnCls}>
              {t('moveBtn')}
            </button>
          </form>
        )}
      </section>

      {/* Ведущий разбирательство */}
      <section className={card} data-testid="incident-commander">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('commander')}</h2>
        <p className="mb-3 text-sm text-secondary">{inc.commanderName ?? t('noCommander')}</p>
        <form action={assignIncidentAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={inc.id} />
          <select
            name="commanderMembershipId"
            className={inputCls}
            aria-label={t('commander')}
            defaultValue={inc.commanderMembershipId ?? ''}
          >
            <option value="">{t('pickMember')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName ?? m.email}
              </option>
            ))}
          </select>
          <button type="submit" className={btnGhostCls}>
            {t('assignBtn')}
          </button>
        </form>
      </section>

      {/* Регуляторное уведомление (IR-02/CBAR, breach) */}
      <section className={card} data-testid="incident-notification">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-primary">{t('notifyHead')}</h2>
          <span
            className={badge(NOTIFY_TONE[inc.notification.status] ?? 'bg-muted text-secondary')}
          >
            {t(`notify.${inc.notification.status}`)}
          </span>
        </div>
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className={label}>{t('regulator')}</dt>
            <dd className="text-foreground">{inc.notification.regulator ?? '—'}</dd>
          </div>
          <div>
            <dt className={label}>{t('notifyDeadline')}</dt>
            <dd className="tabular-nums text-foreground">
              {inc.notification.deadlineAt
                ? dtFmt.format(new Date(inc.notification.deadlineAt))
                : '—'}
            </dd>
          </div>
        </dl>
        <form action={setReportableAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={inc.id} />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="reportable"
              defaultChecked={inc.notification.reportable}
              className="size-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-ring"
            />
            {t('reportable')}
          </label>
          <input
            name="regulator"
            defaultValue={inc.notification.regulator ?? ''}
            placeholder={t('regulatorPh')}
            className={inputCls}
          />
          <button type="submit" className={btnGhostCls}>
            {t('saveBtn')}
          </button>
        </form>
        {inc.notification.reportable && !inc.notification.notifiedAt && (
          <form
            action={notifyRegulatorAction}
            className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
          >
            <input type="hidden" name="id" value={inc.id} />
            <input name="note" placeholder={t('notifyNotePh')} className={`flex-1 ${inputCls}`} />
            <button type="submit" className={btnCls}>
              {t('notifyBtn')}
            </button>
          </form>
        )}
        {inc.notification.notifiedAt && (
          <p className="mt-3 border-t border-border pt-3 text-sm text-secondary">
            {t('notifiedAt', { at: dtFmt.format(new Date(inc.notification.notifiedAt)) })}
            {inc.notification.note ? ` — ${inc.notification.note}` : ''}
          </p>
        )}
      </section>

      {/* Связи: сигналы, затронутое, порождённые findings */}
      <section className={card} data-testid="incident-links">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('links')}</h2>
        {inc.links.length === 0 ? (
          <p className="text-sm text-secondary">{t('noLinks')}</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1.5">
            {inc.links.map((l) => (
              <li key={l.linkId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs text-secondary">
                    {t(`linkType.${l.entityType}`)}
                  </span>
                  {l.title ?? l.entityId}
                </span>
                <form action={unlinkIncidentAction}>
                  <input type="hidden" name="id" value={inc.id} />
                  <input type="hidden" name="linkId" value={l.linkId} />
                  <button type="submit" className="text-xs text-secondary hover:text-destructive">
                    {t('unlink')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={linkIncidentAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={inc.id} />
          <select name="entityType" className={inputCls} aria-label={t('linkTypeLabel')}>
            {LINK_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`linkType.${k}`)}
              </option>
            ))}
          </select>
          <input name="entityId" placeholder={t('linkIdPh')} className={`flex-1 ${inputCls}`} />
          <button type="submit" className={btnGhostCls}>
            {t('linkBtn')}
          </button>
        </form>
      </section>

      {/* Постмортем — доступен с фазы recovered */}
      <section className={card} data-testid="incident-postmortem">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('postmortem')}</h2>
        {!inc.postmortem.available ? (
          <p className="text-sm text-secondary">{t('postmortemLocked')}</p>
        ) : (
          <form action={savePostmortemAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={inc.id} />
            <label className="flex flex-col gap-1">
              <span className={label}>{t('rootCause')}</span>
              <textarea
                name="rootCause"
                rows={2}
                defaultValue={inc.postmortem.rootCause ?? ''}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>{t('impact')}</span>
              <textarea
                name="impactSummary"
                rows={2}
                defaultValue={inc.postmortem.impactSummary ?? ''}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>{t('lessons')}</span>
              <textarea
                name="lessonsLearned"
                rows={2}
                defaultValue={inc.postmortem.lessonsLearned ?? ''}
                className={inputCls}
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className={btnCls}>
                {t('saveBtn')}
              </button>
              {inc.postmortem.savedAt && (
                <span className="text-xs text-secondary">
                  {t('savedAt', { at: dtFmt.format(new Date(inc.postmortem.savedAt)) })}
                </span>
              )}
            </div>
          </form>
        )}
      </section>

      {/* T-IR08: доказательства — документы, привязанные к инциденту */}
      <section className={card} data-testid="incident-documents">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('evidence')}</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-secondary">{t('noEvidence')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {documents.map((d) => (
              <li key={d.id}>
                <Link href={`/documents`} className="text-accent hover:underline">
                  {d.filename}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-secondary">{t('evidenceHint')}</p>
      </section>

      <TagsSection
        entityType="incident"
        entityId={id}
        path={`/incidents/${id}`}
        current={currentTags}
        all={allTags}
        testid="incident-tags"
        labels={{
          title: t('tagsTitle'),
          add: t('tagAdd'),
          none: t('tagNone'),
          attach: t('tagAttach'),
          remove: t('tagRemove'),
        }}
      />

      {/* Таймлайн — источник правды для постмортема */}
      <section className={card} data-testid="incident-timeline">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('timeline')}</h2>
        <ol className="flex flex-col gap-3 border-l border-border pl-4">
          {inc.timeline.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-accent" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-secondary">
                  {dtFmt.format(new Date(e.at))}
                </span>
                {e.toStatus ? (
                  <span className={badge(STATUS_TONE[e.toStatus as keyof typeof STATUS_TONE])}>
                    {t(`st.${e.toStatus}`)}
                  </span>
                ) : (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-secondary">
                    {t(`kind.${e.kind}`)}
                  </span>
                )}
                {e.authorName && <span className="text-xs text-secondary">{e.authorName}</span>}
              </div>
              {e.note && <p className="mt-0.5 text-foreground">{e.note}</p>}
            </li>
          ))}
        </ol>
        <form
          action={addIncidentEventAction}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4"
        >
          <input type="hidden" name="id" value={inc.id} />
          <select name="kind" defaultValue="note" className={inputCls} aria-label={t('kindLabel')}>
            <option value="note">{t('kind.note')}</option>
            <option value="action">{t('kind.action')}</option>
          </select>
          <input name="note" required placeholder={t('notePh')} className={`flex-1 ${inputCls}`} />
          <button type="submit" className={btnGhostCls}>
            {t('addEvent')}
          </button>
        </form>
      </section>
    </main>
  );
}
