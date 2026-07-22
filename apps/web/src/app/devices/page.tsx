import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { createDeviceAction, updateDeviceChecksAction } from './actions';

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
const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const buttonCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
      </div>

      <section className="flex flex-col gap-3" data-testid="device-create">
        <h2 className="text-sm font-semibold text-secondary">{t('create')}</h2>
        <form
          action={createDeviceAction}
          className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm sm:grid-cols-3"
        >
          <input name="name" required placeholder={t('name')} className={inputCls} />
          <input name="os" placeholder={t('os')} className={inputCls} />
          <input name="serial" placeholder={t('serial')} className={inputCls} />
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            {CHECK_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-secondary">
                <input name={key} type="checkbox" className="h-4 w-4 rounded border-border" />
                {t(`checks.${key}`)}
              </label>
            ))}
          </div>
          <button className={`${buttonCls} sm:justify-self-start`}>{t('createButton')}</button>
        </form>
      </section>

      {devices.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
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
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-accent">
                    {t('editChecks')}
                  </summary>
                  <form
                    action={updateDeviceChecksAction.bind(null, d.id)}
                    className="mt-3 flex flex-wrap items-center gap-3"
                  >
                    {CHECK_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-secondary">
                        <input
                          name={key}
                          type="checkbox"
                          defaultChecked={d.checks[key]}
                          className="h-4 w-4 rounded border-border"
                        />
                        {t(`checks.${key}`)}
                      </label>
                    ))}
                    <button className={buttonCls}>{t('saveChecks')}</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
