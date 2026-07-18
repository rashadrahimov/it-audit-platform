import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createTimeEntryAction } from './actions';

export const dynamic = 'force-dynamic';

interface TimeEntry {
  id: string;
  date: string;
  hours: number;
  phase: 'planning' | 'fieldwork' | 'reporting' | null;
  category: 'audit' | 'training' | 'leave' | 'admin' | null;
  engagementId: string | null;
}
interface Engagement {
  id: string;
  title: string;
}

const PHASES = ['planning', 'fieldwork', 'reporting'];
const CATEGORIES = ['audit', 'training', 'leave', 'admin'];

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Тайм-трекинг (T-088): запись часов по аудиту/фазе/категории + список. */
export default async function TimePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('time'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [entriesRes, engRes] = await Promise.all([
    apiFetch('/time-entries', { headers }),
    apiFetch('/engagements', { headers }),
  ]);
  const entries: TimeEntry[] = entriesRes.ok ? await entriesRes.json() : [];
  const engagements: Engagement[] = engRes.ok ? await engRes.json() : [];
  const engById = new Map(engagements.map((e) => [e.id, e.title]));
  const today = new Date().toISOString().slice(0, 10);
  const total = entries.reduce((s, e) => s + (e.hours ?? 0), 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      <form
        action={createTimeEntryAction}
        data-testid="time-create"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('date')}
          <input type="date" name="date" required defaultValue={today} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('hours')}
          <input type="number" name="hours" required min="0.25" max="24" step="0.25" defaultValue="1" className={`w-24 ${inputCls}`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('phase')}
          <select name="phase" defaultValue="fieldwork" className={inputCls}>
            {PHASES.map((p) => (
              <option key={p} value={p}>{t(`phases.${p}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('category')}
          <select name="category" defaultValue="audit" className={inputCls}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          {t('engagement')}
          <select name="engagementId" defaultValue="" className={inputCls}>
            <option value="">{t('noEngagement')}</option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {entries.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">{t('empty')}</section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="time-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('date')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('hours')}</th>
                <th className="px-4 py-3 font-medium">{t('phase')}</th>
                <th className="px-4 py-3 font-medium">{t('category')}</th>
                <th className="px-4 py-3 font-medium">{t('engagement')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-secondary">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{e.hours}</td>
                  <td className="px-4 py-3 text-secondary">{e.phase ? t(`phases.${e.phase}`) : '—'}</td>
                  <td className="px-4 py-3 text-secondary">{e.category ? t(`categories.${e.category}`) : '—'}</td>
                  <td className="px-4 py-3 text-secondary">
                    {e.engagementId ? (engById.get(e.engagementId) ?? '—') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="px-4 py-3 font-medium text-secondary">{t('total')}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground" data-testid="time-total">{total}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </main>
  );
}
