import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  unit: string | null;
  position: string | null;
  employmentStatus: 'active' | 'onboarding' | 'offboarded';
  fromConnector: boolean;
}

const STATUS_TONE: Record<Profile['employmentStatus'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  onboarding: 'bg-sky-100 text-sky-700',
  offboarded: 'bg-muted text-secondary',
};

/** Профили персонала (T-069): импорт из коннектора / ручные, статус занятости. */
export default async function PersonnelPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('personnel'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/personnel', { headers });
  const people: Profile[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {people.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="personnel-table">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-3 font-medium">{t('title')}</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">—</th>
                <th className="px-4 py-3 font-medium">—</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{p.fullName}</div>
                    {(p.position || p.unit) && (
                      <div className="text-xs text-secondary">
                        {[p.position, p.unit].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary">{p.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[p.employmentStatus]}`}
                    >
                      {t(`status.${p.employmentStatus}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-secondary">
                      {p.fromConnector ? t('fromConnector') : t('manual')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
