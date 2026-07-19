import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

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

const STATUS_TONE: Record<WpStatus, string> = {
  draft: 'bg-muted text-secondary',
  prepared: 'bg-sky-100 text-sky-700',
  in_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-indigo-100 text-indigo-700',
  signed_off: 'bg-emerald-100 text-emerald-700',
};

/** Working papers (T-092): выбор engagement + WP со статусом workflow и флагом WP-08. */
export default async function WorkingPapersPage({
  searchParams,
}: {
  searchParams: Promise<{ engagementId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, params] = await Promise.all([
    getTranslations('workingPapers'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const eRes = await apiFetch(`/engagements?locale=${locale}`, { headers });
  const engagements: Engagement[] = eRes.ok ? await eRes.json() : [];
  const selectedId = params.engagementId ?? engagements[0]?.id;

  let papers: WorkingPaper[] = [];
  if (selectedId) {
    const wRes = await apiFetch(`/working-papers?engagementId=${selectedId}`, { headers });
    if (wRes.ok) papers = await wRes.json();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {engagements.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('noEngagements')}
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
              <p className="px-4 py-8 text-center text-secondary">{t('empty')}</p>
            ) : (
              <ul>
                {papers.map((wp) => (
                  <li
                    key={wp.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
                  >
                    <span className="font-medium text-foreground">{wp.title}</span>
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
        </>
      )}
    </main>
  );
}
