import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type CheckKey = 'diskEncryption' | 'screenLock' | 'antivirus' | 'passwordPolicy';
const CHECK_KEYS: CheckKey[] = ['diskEncryption', 'screenLock', 'antivirus', 'passwordPolicy'];

interface Device {
  id: string;
  name: string;
  os: string | null;
  complianceStatus: 'compliant' | 'non_compliant';
  source: string;
  checks: Record<CheckKey, boolean>;
}

/** Endpoint compliance (T-070): устройства с MDM-проверками; статус не только цветом. */
export default async function DevicesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('devices'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/devices', { headers });
  const devices: Device[] = res.ok ? await res.json() : [];

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

      {devices.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="devices">
          {devices.map((d) => {
            const compliant = d.complianceStatus === 'compliant';
            return (
              <li key={d.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-foreground">{d.name}</span>
                    {d.os && <span className="text-sm text-secondary">· {d.os}</span>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                      compliant ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {compliant ? t('compliant') : t('non_compliant')}
                  </span>
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {CHECK_KEYS.map((key) => {
                    const pass = d.checks[key];
                    return (
                      <li
                        key={key}
                        className={`flex items-center gap-1 text-xs ${pass ? 'text-emerald-700' : 'text-secondary'}`}
                      >
                        <span aria-hidden className="font-bold">
                          {pass ? '✓' : '✕'}
                        </span>
                        {t(`checks.${key}`)}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
