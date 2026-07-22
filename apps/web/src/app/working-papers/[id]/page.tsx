import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { transitionWorkingPaperAction, updateWorkingPaperContentAction } from '../actions';

export const dynamic = 'force-dynamic';

type Status = 'draft' | 'prepared' | 'in_review' | 'reviewed' | 'signed_off';
interface Paper {
  id: string;
  title: string;
  content: unknown;
  status: Status;
  editedSinceReview: boolean;
  signOffs: Array<{ role: string; membershipId: string; signedAt: string }>;
}
const NEXT: Record<Status, Status[]> = {
  draft: ['prepared'],
  prepared: ['in_review'],
  in_review: ['reviewed', 'prepared'],
  reviewed: ['signed_off'],
  signed_off: [],
};

export default async function WorkingPaperDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const [t, tenantSlug] = await Promise.all([
    getTranslations('workingPapers'),
    getActiveTenantSlug(),
  ]);
  const res = await apiFetch(`/working-papers/${id}`, {
    headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
  });
  if (!res.ok) notFound();
  const paper = (await res.json()) as Paper;
  const content = JSON.stringify(paper.content ?? {}, null, 2);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <Link href="/working-papers" className="text-sm font-medium text-accent hover:underline">
        {t('back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-primary">{paper.title}</h1>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-secondary">
          {t(`status.${paper.status}`)}
        </span>
      </div>
      {paper.editedSinceReview && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {t('editedSinceReview')}
        </p>
      )}
      <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-primary">{t('workflow')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {NEXT[paper.status].map((to) => (
            <form key={to} action={transitionWorkingPaperAction.bind(null, paper.id, to)}>
              <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-primary">
                {t('transitionTo', { status: t(`status.${to}`) })}
              </button>
            </form>
          ))}
          {NEXT[paper.status].length === 0 && <span className="text-sm text-secondary">—</span>}
        </div>
      </section>
      <form
        action={updateWorkingPaperContentAction.bind(null, paper.id)}
        className="rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold text-primary">{t('content')}</span>
          <textarea
            name="content"
            defaultValue={content}
            className="min-h-64 rounded-md border border-border p-3 font-mono text-sm"
          />
        </label>
        <button className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary">
          {t('saveContent')}
        </button>
      </form>
      <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-primary">{t('signOffs')}</h2>
        <p className="mt-2 text-sm text-secondary">
          {t('signOffCount', { n: paper.signOffs.length })}
        </p>
      </section>
    </main>
  );
}
