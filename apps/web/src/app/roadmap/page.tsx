import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { setTargetDateAction } from './actions';

export const dynamic = 'force-dynamic';

interface Phase {
  key: string;
  progress: number;
}
interface RoadmapItem {
  activationId: string;
  frameworkId: string;
  name: string;
  phases: Phase[];
  overall: number;
  auditReady: boolean;
  targetDate: string | null;
  elapsedPct: number | null;
  onTrack: boolean | null;
}
interface Roadmap {
  phaseOrder: string[];
  items: RoadmapItem[];
}

function barTone(progress: number): string {
  if (progress >= 100) return 'bg-emerald-500';
  if (progress >= 60) return 'bg-emerald-500';
  if (progress >= 30) return 'bg-amber-500';
  return 'bg-red-400';
}

/** Roadmap внедрения per-framework (T-V33): фазы, прогресс от данных, audit-ready дата. */
export default async function RoadmapPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('roadmap'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  const res = await apiFetch(`/roadmap?locale=${locale}`, {
    headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
  });
  const data: Roadmap = res.ok ? await res.json() : { phaseOrder: [], items: [] };

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {data.items.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="roadmap">
          {data.items.map((it) => (
            <li
              key={it.activationId}
              data-testid={`roadmap-${it.frameworkId}`}
              className="rounded-xl border border-border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{it.name}</span>
                <span className="flex items-center gap-2">
                  {it.auditReady ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      {t('auditReady')}
                    </span>
                  ) : (
                    it.onTrack !== null && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          it.onTrack ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {it.onTrack ? t('onTrack') : t('offTrack')}
                      </span>
                    )
                  )}
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {t('overall')}: {it.overall}%
                  </span>
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2.5">
                {it.phases.map((ph) => (
                  <div key={ph.key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs font-medium text-secondary">
                      {t(`ph.${ph.key}`)}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${barTone(ph.progress)}`}
                        style={{ width: `${ph.progress}%` }}
                        data-testid={`phase-${ph.key}`}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-secondary">
                      {ph.progress}%
                    </span>
                  </div>
                ))}
              </div>

              <form
                action={setTargetDateAction.bind(null, it.activationId)}
                className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-secondary">{t('target')}</span>
                  <input
                    type="date"
                    name="targetDate"
                    defaultValue={it.targetDate ? it.targetDate.slice(0, 10) : ''}
                    className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  data-testid={`target-save-${it.frameworkId}`}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t('setTarget')}
                </button>
                <span className="ml-auto self-center text-xs text-secondary">
                  {it.targetDate
                    ? `${dateFmt.format(new Date(it.targetDate))}${it.elapsedPct !== null ? ` · ${it.elapsedPct}% ${t('elapsed')}` : ''}`
                    : t('noTarget')}
                </span>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
