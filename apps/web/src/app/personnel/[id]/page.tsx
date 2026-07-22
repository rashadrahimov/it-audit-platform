import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { setPersonnelStatusAction } from '../actions';

export const dynamic = 'force-dynamic';

type Status = 'active' | 'onboarding' | 'offboarded';
interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  unit: string | null;
  position: string | null;
  employmentStatus: Status;
  fromConnector: boolean;
  taskSummary: { total: number; open: number; overdue: number };
}
const STATUSES: Status[] = ['active', 'onboarding', 'offboarded'];

export default async function PersonnelDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const [t, tenantSlug] = await Promise.all([getTranslations('personnel'), getActiveTenantSlug()]);
  const res = await apiFetch('/personnel', {
    headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
  });
  const people: Profile[] = res.ok ? await res.json() : [];
  const profile = people.find((item) => item.id === id);
  if (!profile) notFound();
  const summary = profile.taskSummary ?? { total: 0, open: 0, overdue: 0 };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <Link href="/personnel" className="text-sm font-medium text-accent hover:underline">
        {t('back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-primary">{profile.fullName}</h1>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-secondary">
          {t(`status.${profile.employmentStatus}`)}
        </span>
      </div>
      <section className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm sm:grid-cols-2">
        <Info label={t('email')} value={profile.email} />
        <Info label={t('position')} value={profile.position} />
        <Info label={t('unit')} value={profile.unit} />
        <Info
          label={t('source')}
          value={profile.fromConnector ? t('fromConnector') : t('manual')}
        />
      </section>
      <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-primary">{t('taskStatus')}</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <Metric label={t('taskTotal')} value={summary.total} />
          <Metric label={t('taskOpen')} value={summary.open} />
          <Metric label={t('taskOverdue')} value={summary.overdue} />
        </div>
      </section>
      <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-primary">{t('actions')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUSES.filter((status) => status !== profile.employmentStatus).map((status) => (
            <form key={status} action={setPersonnelStatusAction.bind(null, profile.id, status)}>
              <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-primary">
                {t(`to.${status}`)}
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-secondary">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-xl font-bold text-primary">{value}</p>
      <p className="text-xs text-secondary">{label}</p>
    </div>
  );
}
