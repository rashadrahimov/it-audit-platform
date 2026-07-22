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
  memory: string | null;
}
interface AiStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
}
interface AiPrivacyPosture {
  provider?: string;
  model?: string | null;
  source: 'tenant_override' | 'deployment_default' | 'deterministic';
  externalAiEnabled?: boolean;
  dataEgress: 'none' | 'private_network' | 'external_provider';
  residencyMode: 'local_only' | 'private_network' | 'external_provider';
  trainingUseAllowed: boolean;
  zeroDataRetentionRequired: boolean;
  requiresDpa: boolean;
  deploymentClass?: 'deterministic_no_ai' | 'private_ai_endpoint' | 'external_ai_provider';
  assuranceClaims?: Array<{
    key:
      | 'no_training'
      | 'tenant_isolation'
      | 'encrypted_secrets'
      | 'human_review'
      | 'evidence_grounded'
      | 'zero_retention'
      | 'dpa_required';
    status: 'enforced' | 'required' | 'not_applicable';
    evidence: string;
  }>;
  processingObligations?: {
    dataProcessingAgreementRequired: boolean;
    zeroDataRetentionRequired: boolean;
    privateDeploymentRecommended: boolean;
    customerDataUsedForTraining: false;
  };
}

const PROVIDERS = ['none', 'anthropic', 'openai_compat'] as const;
const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const trustCardCls =
  'rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-5 text-white shadow-xl shadow-emerald-950/15';

/** Per-tenant выбор LLM-провайдера (EP-AI, T-H23): клиент сам подключает Claude/GPT/Kimi/локальную. */
export default async function AiSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('aiSettings'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [cfgRes, statusRes, postureRes] = await Promise.all([
    apiFetch('/ai/config', { headers }),
    apiFetch('/ai/status', { headers }),
    apiFetch('/ai/privacy-posture', { headers }),
  ]);
  const cfg: TenantAiConfig = cfgRes.ok
    ? await cfgRes.json()
    : { provider: 'none', baseUrl: null, model: null, hasKey: false, memory: null };
  const status: AiStatus = statusRes.ok
    ? await statusRes.json()
    : { enabled: false, provider: 'none', model: null };
  const posture: AiPrivacyPosture = postureRes.ok
    ? await postureRes.json()
    : {
        source: 'deterministic',
        dataEgress: 'none',
        residencyMode: 'local_only',
        trainingUseAllowed: false,
        zeroDataRetentionRequired: false,
        requiresDpa: false,
        deploymentClass: 'deterministic_no_ai',
        assuranceClaims: [],
        processingObligations: {
          dataProcessingAgreementRequired: false,
          zeroDataRetentionRequired: false,
          privateDeploymentRecommended: false,
          customerDataUsedForTraining: false,
        },
      };
  const tenantConfigured = cfg.provider !== 'none' && cfg.hasKey && Boolean(cfg.model);
  const effectiveEnabled = tenantConfigured || status.enabled;
  const effectiveProvider = tenantConfigured ? cfg.provider : status.provider;
  const effectiveModel = tenantConfigured ? cfg.model : status.model;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <p className="text-sm text-secondary">{t('intro')}</p>

      <section data-testid="ai-trust-posture" className={trustCardCls}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.28em] text-emerald-200 uppercase">
              {t('trust.kicker')}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{t('trust.title')}</h2>
            <p className="mt-2 text-sm text-emerald-50/75">{t('trust.body')}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm backdrop-blur lg:min-w-64">
            <p className="text-xs font-medium text-emerald-50/65">{t('trust.effectiveMode')}</p>
            <p className="mt-1 text-lg font-semibold">
              {effectiveEnabled
                ? `${t(`providers.${effectiveProvider}`)}${effectiveModel ? ` · ${effectiveModel}` : ''}`
                : t('trust.deterministic')}
            </p>
            <p className="mt-2 text-xs text-emerald-50/65">
              {tenantConfigured ? t('trust.tenantOverride') : t('trust.deploymentFallback')}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {(['grounded', 'human', 'secrets', 'privateMode'] as const).map((key) => (
            <div key={key} className="rounded-xl border border-white/10 bg-white/10 p-3">
              <dt className="text-sm font-semibold text-emerald-50">
                {t(`trust.cards.${key}.title`)}
              </dt>
              <dd className="mt-1 text-xs leading-5 text-emerald-50/70">
                {t(`trust.cards.${key}.body`)}
              </dd>
            </div>
          ))}
        </dl>
        <div
          data-testid="ai-assurance-claims"
          className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">
                {t('privacy.assuranceKicker')}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-primary">
                {t('privacy.assuranceTitle')}
              </h3>
              <p className="mt-1 text-xs text-secondary">
                {t('privacy.assuranceBody', {
                  deploymentClass: posture.deploymentClass
                    ? t(`privacy.deploymentClasses.${posture.deploymentClass}`)
                    : '—',
                })}
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
              {t('privacy.customerTraining')}:{' '}
              {posture.processingObligations?.customerDataUsedForTraining
                ? t('privacy.allowed')
                : t('privacy.notAllowed')}
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(posture.assuranceClaims ?? []).map((claim) => (
              <div key={claim.key} className="rounded-xl bg-white/85 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-xs font-semibold text-primary">
                    {t(`privacy.claims.${claim.key}`)}
                  </dt>
                  <dd
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      claim.status === 'enforced'
                        ? 'bg-emerald-100 text-emerald-800'
                        : claim.status === 'required'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-muted text-secondary'
                    }`}
                  >
                    {t(`privacy.claimStatuses.${claim.status}`)}
                  </dd>
                </div>
                <p className="mt-1 text-xs leading-5 text-secondary">{claim.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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

      <section
        data-testid="ai-privacy-posture"
        className="rounded-xl border border-border bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-accent uppercase">
            {t('privacy.kicker')}
          </p>
          <h2 className="text-lg font-semibold text-primary">{t('privacy.title')}</h2>
          <p className="text-sm text-secondary">{t('privacy.body')}</p>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs font-medium text-secondary">{t('privacy.source')}</dt>
            <dd className="mt-1 text-sm font-semibold text-primary">
              {t(`privacy.sources.${posture.source}`)}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs font-medium text-secondary">{t('privacy.residency')}</dt>
            <dd className="mt-1 text-sm font-semibold text-primary">
              {t(`privacy.residencyModes.${posture.residencyMode}`)}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs font-medium text-secondary">{t('privacy.egress')}</dt>
            <dd className="mt-1 text-sm font-semibold text-primary">
              {t(`privacy.dataEgress.${posture.dataEgress}`)}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs font-medium text-secondary">{t('privacy.training')}</dt>
            <dd className="mt-1 text-sm font-semibold text-primary">
              {posture.trainingUseAllowed ? t('privacy.allowed') : t('privacy.notAllowed')}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs font-medium text-secondary">{t('privacy.zeroRetention')}</dt>
            <dd className="mt-1 text-sm font-semibold text-primary">
              {posture.zeroDataRetentionRequired ? t('privacy.required') : t('privacy.notRequired')}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs font-medium text-secondary">{t('privacy.dpa')}</dt>
            <dd className="mt-1 text-sm font-semibold text-primary">
              {posture.requiresDpa ? t('privacy.required') : t('privacy.notRequired')}
            </dd>
          </div>
        </dl>
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

        <label className="flex flex-col gap-1 text-xs text-secondary">
          {t('memory')}
          <textarea
            name="memory"
            rows={4}
            defaultValue={cfg.memory ?? ''}
            data-testid="ai-memory"
            placeholder={t('memoryPh')}
            className={inputCls}
          />
          <span className="text-[11px] text-secondary">{t('memoryHint')}</span>
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
