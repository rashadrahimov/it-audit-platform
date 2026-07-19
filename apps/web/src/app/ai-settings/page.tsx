import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { saveAiConfigAction } from './actions';

export const dynamic = 'force-dynamic';

interface TenantAiConfig {
  provider: 'none' | 'anthropic' | 'openai_compat';
  baseUrl: string | null;
  model: string | null;
  hasKey: boolean;
}
interface AiStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
}

const PROVIDERS = ['none', 'anthropic', 'openai_compat'] as const;
const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Per-tenant выбор LLM-провайдера (EP-AI, T-H23): клиент сам подключает Claude/GPT/Kimi/локальную. */
export default async function AiSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('aiSettings'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [cfgRes, statusRes] = await Promise.all([
    apiFetch('/ai/config', { headers }),
    apiFetch('/ai/status', { headers }),
  ]);
  const cfg: TenantAiConfig = cfgRes.ok
    ? await cfgRes.json()
    : { provider: 'none', baseUrl: null, model: null, hasKey: false };
  const status: AiStatus = statusRes.ok
    ? await statusRes.json()
    : { enabled: false, provider: 'none', model: null };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      <p className="text-sm text-secondary">{t('intro')}</p>

      {/* Деплой-дефолт (env) — справочно */}
      <section
        data-testid="ai-deploy-default"
        className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-secondary"
      >
        {t('deployDefault')}:{' '}
        <span className="font-medium text-foreground">
          {status.enabled ? `${status.provider} · ${status.model}` : t('deployOff')}
        </span>
      </section>

      {/* Форма выбора провайдера тенантом */}
      <form
        action={saveAiConfigAction}
        data-testid="ai-config-form"
        className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5 shadow-sm"
      >
        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('provider')}
          <select name="provider" defaultValue={cfg.provider} className={inputCls}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`providers.${p}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('baseUrl')}
          <input
            name="baseUrl"
            defaultValue={cfg.baseUrl ?? ''}
            placeholder="https://api.moonshot.cn/v1"
            className={`${inputCls} font-mono`}
          />
          <span className="text-[11px] text-secondary">{t('baseUrlHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('model')}
          <input
            name="model"
            defaultValue={cfg.model ?? ''}
            placeholder="claude-opus-4-8 / gpt-4o / kimi-k2 / deepseek-chat"
            className={`${inputCls} font-mono`}
          />
          <span className="text-[11px] text-secondary">{t('modelHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('apiKey')}
          <input
            type="password"
            name="apiKey"
            autoComplete="off"
            placeholder={cfg.hasKey ? t('apiKeySet') : t('apiKeyEmpty')}
            className={`${inputCls} font-mono`}
          />
          <span className="text-[11px] text-secondary">{t('apiKeyHint')}</span>
        </label>

        <button
          type="submit"
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('save')}
        </button>
      </form>

      <p className="text-xs text-secondary">{t('residencyNote')}</p>
    </main>
  );
}
