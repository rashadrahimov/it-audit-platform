import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { addChecklistItemsAction, transitionAction } from './actions';

export const dynamic = 'force-dynamic';

interface EngagementDetail {
  id: string;
  title: string;
  subsidiary: string | null;
  auditType: string | null;
  mode: string;
  state: string;
  periodStart: string | null;
  periodEnd: string | null;
  allowedTransitions: string[];
  milestones: Array<{ stage: string; plannedDate: string | null; actualDate: string | null }>;
  checklist: Array<{
    id: string;
    ref: string;
    domainCode: string | null;
    objective: string;
    question: string;
    status: string;
    controlId: string | null;
  }>;
}

interface LibraryControl {
  id: string;
  ref: string;
  objective: string;
}

/** Карточка engagement'а (T-035): состояние, переходы, вехи план/факт (ENG-03). */
export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const [t, tStates, locale, tenantSlug] = await Promise.all([
    getTranslations('engagementDetail'),
    getTranslations('engagementStates'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  if (!tenantSlug) redirect('/engagements');

  const res = await apiFetch(`/engagements/${id}?locale=${locale}`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) throw new Error(`API /engagements/${id}: ${res.status}`);
  const eng: EngagementDetail = await res.json();

  // библиотека для формы добавления — без уже включённых контролей
  const libRes = await apiFetch(`/controls?locale=${locale}&tenantSlug=${tenantSlug}`);
  const library: LibraryControl[] = libRes.ok ? await libRes.json() : [];
  const inChecklist = new Set(eng.checklist.map((i) => i.controlId).filter(Boolean));
  const addable = library.filter((c) => !inChecklist.has(c.id));

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const fmt = (iso: string | null): string => (iso ? dateFmt.format(new Date(iso)) : '—');

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{eng.title}</h1>
        <Link
          href="/engagements"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('back')}
        </Link>
      </div>

      <section
        className="rounded-xl border border-border bg-white p-6 shadow-sm"
        data-testid="engagement-detail"
      >
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('subsidiary')}
            </dt>
            <dd className="text-foreground">{eng.subsidiary ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('auditType')}
            </dt>
            <dd className="text-foreground">{eng.auditType ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('mode')}
            </dt>
            <dd className="text-foreground">{t(`modes.${eng.mode}`)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-secondary uppercase">
              {t('state')}
            </dt>
            <dd>
              <span
                data-testid="engagement-state"
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary"
              >
                {tStates(eng.state)}
              </span>
            </dd>
          </div>
        </dl>
        {eng.allowedTransitions.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {eng.allowedTransitions.map((to) => (
              <form key={to} action={transitionAction.bind(null, eng.id, to)}>
                <button
                  type="submit"
                  data-testid={`transition-${to}`}
                  className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  → {tStates(to)}
                </button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('checklist')}</h2>
        {eng.checklist.length === 0 ? (
          <p className="text-sm text-secondary">{t('checklistEmpty')}</p>
        ) : (
          <table className="w-full text-left text-sm" data-testid="engagement-checklist">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="py-2 pr-4 font-medium">{t('checklistRef')}</th>
                <th className="py-2 pr-4 font-medium">{t('checklistQuestion')}</th>
                <th className="py-2 font-medium">{t('checklistStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {eng.checklist.map((item) => (
                <tr key={item.id} className="border-b border-border align-top last:border-0">
                  <td className="py-2 pr-4 font-medium whitespace-nowrap text-foreground">
                    {item.ref}
                  </td>
                  <td className="py-2 pr-4 text-foreground">{item.question}</td>
                  <td className="py-2">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-secondary">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {addable.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-accent">
              {t('checklistAdd')}
            </summary>
            <form
              action={addChecklistItemsAction.bind(null, eng.id)}
              className="mt-3 flex flex-col gap-3"
            >
              <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-3">
                {addable.map((c) => (
                  <label key={c.id} className="flex items-baseline gap-2 text-sm">
                    <input type="checkbox" name="controlId" value={c.id} />
                    <span className="font-medium whitespace-nowrap text-foreground">{c.ref}</span>
                    <span className="text-secondary">{c.objective}</span>
                  </label>
                ))}
              </div>
              <button
                type="submit"
                data-testid="add-checklist-items"
                className="cursor-pointer self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('checklistSubmit')}
              </button>
            </form>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('milestones')}</h2>
        {eng.milestones.length === 0 ? (
          <p className="text-sm text-secondary">{t('milestonesEmpty')}</p>
        ) : (
          <table className="w-full text-left text-sm" data-testid="engagement-milestones">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="py-2 pr-4 font-medium">{t('stage')}</th>
                <th className="py-2 pr-4 font-medium">{t('planned')}</th>
                <th className="py-2 font-medium">{t('actual')}</th>
              </tr>
            </thead>
            <tbody>
              {eng.milestones.map((m) => (
                <tr key={m.stage} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-foreground">{tStates(m.stage)}</td>
                  <td className="py-2 pr-4 text-secondary">{fmt(m.plannedDate)}</td>
                  <td className="py-2 text-secondary">{fmt(m.actualDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
