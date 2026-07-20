import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { saveSsoConfigAction } from './actions';

export const dynamic = 'force-dynamic';

interface SsoConfig {
  enabled: boolean;
  protocol: 'oidc' | 'saml';
  emailDomain: string;
  entryPoint: string;
  clientId: string;
  hasSecret: boolean;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** T-V49: per-tenant SSO-конфиг — тенант подключает собственный IdP (OIDC/SAML). */
export default async function SsoSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('ssoSettings'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/sso-config', { headers });
  const cfg: SsoConfig = res.ok
    ? await res.json()
    : {
        enabled: false,
        protocol: 'oidc',
        emailDomain: '',
        entryPoint: '',
        clientId: '',
        hasSecret: false,
      };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <p className="text-sm text-secondary">{t('intro')}</p>

      <form
        action={saveSsoConfigAction}
        data-testid="sso-config-form"
        className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5 shadow-sm"
      >
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={cfg.enabled}
            data-testid="sso-enabled"
          />
          {t('enabled')}
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('protocol')}
          <select name="protocol" defaultValue={cfg.protocol} className={inputCls}>
            <option value="oidc">OIDC</option>
            <option value="saml">SAML</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('emailDomain')}
          <input
            name="emailDomain"
            defaultValue={cfg.emailDomain}
            placeholder="corp.example.com"
            className={`${inputCls} font-mono`}
          />
          <span className="text-[11px] text-secondary">{t('emailDomainHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('entryPoint')}
          <input
            name="entryPoint"
            defaultValue={cfg.entryPoint}
            placeholder="https://idp.example.com/.well-known/openid-configuration"
            className={`${inputCls} font-mono`}
          />
          <span className="text-[11px] text-secondary">{t('entryPointHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('clientId')}
          <input
            name="clientId"
            defaultValue={cfg.clientId}
            autoComplete="off"
            className={`${inputCls} font-mono`}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('clientSecret')}
          <input
            type="password"
            name="clientSecret"
            autoComplete="off"
            placeholder={cfg.hasSecret ? t('secretSet') : t('secretEmpty')}
            data-testid="sso-secret"
            className={`${inputCls} font-mono`}
          />
          <span className="text-[11px] text-secondary">{t('secretHint')}</span>
        </label>

        <button
          type="submit"
          data-testid="sso-save"
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('save')}
        </button>
      </form>

      <p className="text-xs text-secondary">{t('note')}</p>
    </main>
  );
}
