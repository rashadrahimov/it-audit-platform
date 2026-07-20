import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { MfaSection } from './mfa-section';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  fullName: string;
  mfaEnabled: boolean;
}

/** T-V52: личная безопасность — self-service MFA. T-V60: org-policy require-MFA + комплаенс команды. */
export default async function SecurityPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('security'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  let requireMfa = false;
  let members: Member[] = [];
  if (tenantSlug) {
    const [bizRes, memRes] = await Promise.all([
      apiFetch('/business-profile', { headers }),
      apiFetch(`/memberships?locale=${locale}`, { headers }),
    ]);
    if (bizRes.ok) requireMfa = Boolean((await bizRes.json()).requireMfa);
    if (memRes.ok) members = await memRes.json();
  }
  const enabledCount = members.filter((m) => m.mfaEnabled).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <p className="text-sm text-secondary">{t('intro')}</p>

      {/* T-V60: организация требует MFA, а у пользователя не включён — заметный призыв */}
      {requireMfa && !user.mfaEnabled && (
        <div
          data-testid="mfa-required-banner"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{t('requiredTitle')}</p>
          <p className="mt-1">{t('requiredBody')}</p>
        </div>
      )}

      <section className="flex flex-col gap-3" data-testid="mfa">
        <h2 className="text-sm font-semibold text-secondary">{t('mfaTitle')}</h2>
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <MfaSection enabled={user.mfaEnabled} />
        </div>
      </section>

      {/* T-V60: видимость MFA-комплаенса команды при включённой policy */}
      {requireMfa && members.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="mfa-compliance">
          <h2 className="text-sm font-semibold text-secondary">{t('teamTitle')}</h2>
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm text-foreground">
              {t('teamCount', { enabled: enabledCount, total: members.length })}
            </p>
            <ul className="flex flex-col gap-1.5">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{m.fullName}</span>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-xs font-medium ' +
                      (m.mfaEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
                    }
                  >
                    {m.mfaEnabled ? t('on') : t('off')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
