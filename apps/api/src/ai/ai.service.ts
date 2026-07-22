import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { decryptConfig, encryptConfig } from '../connectors/config-crypto';
import { DbService } from '../db/db.service';
import { tenantAiConfig } from '../db/schema';
import { env } from '../env';
import { callLlm, isConfigured, type LlmConfig, type LlmProviderKind } from './llm-provider';

/** Публичный вид конфига тенанта (без ключа — только флаг наличия). */
export interface TenantAiConfigView {
  provider: LlmProviderKind;
  baseUrl: string | null;
  model: string | null;
  hasKey: boolean;
  memory: string | null;
}

export interface AiPrivacyPosture {
  provider: LlmProviderKind;
  model: string | null;
  source: 'tenant_override' | 'deployment_default' | 'deterministic';
  externalAiEnabled: boolean;
  dataEgress: 'none' | 'private_network' | 'external_provider';
  residencyMode: 'local_only' | 'private_network' | 'external_provider';
  trainingUseAllowed: false;
  zeroDataRetentionRequired: boolean;
  requiresDpa: boolean;
  controls: {
    tenantIsolation: true;
    encryptedSecrets: true;
    evidenceGroundedOutputRequired: true;
    humanReviewRequired: true;
  };
  deploymentClass: 'deterministic_no_ai' | 'private_ai_endpoint' | 'external_ai_provider';
  assuranceClaims: Array<{
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
  processingObligations: {
    dataProcessingAgreementRequired: boolean;
    zeroDataRetentionRequired: boolean;
    privateDeploymentRecommended: boolean;
    customerDataUsedForTraining: false;
  };
}

export interface SetTenantAiConfig {
  provider: LlmProviderKind;
  baseUrl?: string;
  model?: string;
  /** Пустой/отсутствует на update → оставить существующий ключ. */
  apiKey?: string;
  /** T-V36b: AI Memory — контекст тенанта в промпт. */
  memory?: string;
}

function hostOf(baseUrl: string | null | undefined): string {
  if (!baseUrl) return '';
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return baseUrl.toLowerCase();
  }
}

function isPrivateAiEndpoint(baseUrl: string | null | undefined): boolean {
  const host = hostOf(baseUrl);
  return (
    host === 'localhost' ||
    host === 'ollama' ||
    host === 'vllm' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

export function aiPrivacyPosture(input: {
  provider: LlmProviderKind;
  baseUrl?: string | null;
  model?: string | null;
  source: AiPrivacyPosture['source'];
  configured: boolean;
}): AiPrivacyPosture {
  const localOpenAiCompat =
    input.provider === 'openai_compat' && isPrivateAiEndpoint(input.baseUrl ?? null);
  const externalAiEnabled =
    input.configured && input.provider !== 'none' && input.provider !== undefined;
  const dataEgress = !externalAiEnabled
    ? 'none'
    : localOpenAiCompat
      ? 'private_network'
      : 'external_provider';
  const residencyMode =
    dataEgress === 'none'
      ? 'local_only'
      : dataEgress === 'private_network'
        ? 'private_network'
        : 'external_provider';
  const deploymentClass =
    dataEgress === 'none'
      ? 'deterministic_no_ai'
      : dataEgress === 'private_network'
        ? 'private_ai_endpoint'
        : 'external_ai_provider';
  const cloudObligations = dataEgress === 'external_provider';

  return {
    provider: input.provider,
    model: input.configured ? (input.model ?? null) : null,
    source: input.source,
    externalAiEnabled,
    dataEgress,
    residencyMode,
    trainingUseAllowed: false,
    zeroDataRetentionRequired: cloudObligations,
    requiresDpa: cloudObligations,
    controls: {
      tenantIsolation: true,
      encryptedSecrets: true,
      evidenceGroundedOutputRequired: true,
      humanReviewRequired: true,
    },
    deploymentClass,
    assuranceClaims: [
      {
        key: 'no_training',
        status: 'enforced',
        evidence: 'trainingUseAllowed=false is hard-coded in the effective AI posture.',
      },
      {
        key: 'tenant_isolation',
        status: 'enforced',
        evidence: 'Tenant-scoped AI config is read through tenant RLS and permission-guarded APIs.',
      },
      {
        key: 'encrypted_secrets',
        status: 'enforced',
        evidence: 'Provider API keys are stored encrypted and only exposed as hasKey=true.',
      },
      {
        key: 'human_review',
        status: 'enforced',
        evidence: 'AI outputs remain draft-only until auditor review and acceptance.',
      },
      {
        key: 'evidence_grounded',
        status: 'enforced',
        evidence: 'AI findings/risks require evidence references before acceptance.',
      },
      {
        key: 'zero_retention',
        status: cloudObligations ? 'required' : 'not_applicable',
        evidence: cloudObligations
          ? 'External provider mode requires zero data retention terms.'
          : 'No external AI provider receives customer prompts in this mode.',
      },
      {
        key: 'dpa_required',
        status: cloudObligations ? 'required' : 'not_applicable',
        evidence: cloudObligations
          ? 'External provider mode requires a data-processing agreement.'
          : 'No external AI provider processor is active in this mode.',
      },
    ],
    processingObligations: {
      dataProcessingAgreementRequired: cloudObligations,
      zeroDataRetentionRequired: cloudObligations,
      privateDeploymentRecommended: cloudObligations,
      customerDataUsedForTraining: false,
    },
  };
}

/**
 * Ассист поверх LLM (EP-AI, T-H21/H22/H23). Мульти-провайдер: Claude или любой OpenAI-совместимый
 * (GPT/Kimi/DeepSeek/Ollama/…). Клиент сам выбирает провайдера per-tenant (БД, T-H23); нет
 * override → деплой-дефолт из env. ВЫКЛЮЧЕН по умолчанию → draftText()=null → детерминированный
 * fallback вызывающего; on-prem остаётся без ИИ (ADR-0002).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly db: DbService) {}

  /** Деплой-уровень: конфиг из env (дефолт для тенантов без override). */
  private envConfig(): LlmConfig {
    return {
      provider: env.aiProvider as LlmProviderKind,
      apiKey: env.aiApiKey,
      baseUrl: env.aiBaseUrl || undefined,
      model: env.aiModel,
    };
  }

  enabled(): boolean {
    return isConfigured(this.envConfig());
  }

  status() {
    const cfg = this.envConfig();
    const on = isConfigured(cfg);
    return {
      enabled: on,
      provider: cfg.provider,
      model: on ? cfg.model : null,
      baseUrl: on && cfg.provider === 'openai_compat' ? cfg.baseUrl : null,
    };
  }

  privacyPostureForDeployment(): AiPrivacyPosture {
    const cfg = this.envConfig();
    const configured = isConfigured(cfg);
    return aiPrivacyPosture({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      source: configured ? 'deployment_default' : 'deterministic',
      configured,
    });
  }

  // --- Per-tenant override (T-H23) ---

  private async readRow(tenantId: string) {
    const [row] = await this.db.withTenant(tenantId, (tx) =>
      tx.select().from(tenantAiConfig).where(eq(tenantAiConfig.tenantId, tenantId)),
    );
    return row ?? null;
  }

  /** Публичный конфиг тенанта (без ключа). Нет строки → выключено. */
  async getTenantConfig(tenantId: string): Promise<TenantAiConfigView> {
    const row = await this.readRow(tenantId);
    return {
      provider: (row?.provider ?? 'none') as LlmProviderKind,
      baseUrl: row?.baseUrl ?? null,
      model: row?.model ?? null,
      hasKey: Boolean(row?.apiKeyEncrypted),
      memory: row?.memory ?? null,
    };
  }

  async getTenantPrivacyPosture(tenantId: string): Promise<AiPrivacyPosture> {
    const row = await this.readRow(tenantId);
    if (row && row.provider !== 'none') {
      const configured = Boolean(row.apiKeyEncrypted && row.model);
      return aiPrivacyPosture({
        provider: row.provider as LlmProviderKind,
        baseUrl: row.baseUrl,
        model: row.model,
        source: 'tenant_override',
        configured,
      });
    }
    return this.privacyPostureForDeployment();
  }

  /** Upsert конфига тенанта. Пустой apiKey на update → ключ сохраняется. */
  async setTenantConfig(tenantId: string, input: SetTenantAiConfig): Promise<TenantAiConfigView> {
    const existing = await this.readRow(tenantId);
    const apiKeyEncrypted = input.apiKey
      ? encryptConfig({ apiKey: input.apiKey })
      : (existing?.apiKeyEncrypted ?? null);
    const values = {
      provider: input.provider,
      baseUrl: input.baseUrl ?? null,
      model: input.model ?? null,
      apiKeyEncrypted,
      memory: input.memory !== undefined ? input.memory || null : (existing?.memory ?? null),
    };
    await this.db.withTenant(tenantId, (tx) =>
      existing
        ? tx.update(tenantAiConfig).set(values).where(eq(tenantAiConfig.tenantId, tenantId))
        : tx.insert(tenantAiConfig).values({ tenantId, ...values }),
    );
    return this.getTenantConfig(tenantId);
  }

  /** Эффективный конфиг тенанта: override из БД, иначе деплой-дефолт из env. */
  private async resolveTenantConfig(tenantId: string): Promise<LlmConfig> {
    const row = await this.readRow(tenantId);
    if (!row || row.provider === 'none') return this.envConfig();
    let apiKey = '';
    if (row.apiKeyEncrypted) {
      try {
        apiKey = String((decryptConfig(row.apiKeyEncrypted) as { apiKey?: string }).apiKey ?? '');
      } catch {
        apiKey = '';
      }
    }
    return {
      provider: row.provider as LlmProviderKind,
      apiKey,
      baseUrl: row.baseUrl ?? undefined,
      model: row.model ?? env.aiModel,
    };
  }

  // --- Генерация ---

  /** Текст по деплой-дефолту (env). */
  async draftText(system: string, user: string): Promise<string | null> {
    return this.run(this.envConfig(), system, user);
  }

  /** Текст по эффективному конфигу тенанта (override → env); AI Memory подмешивается в system. */
  async draftTextForTenant(tenantId: string, system: string, user: string): Promise<string | null> {
    const row = await this.readRow(tenantId);
    const memory = row?.memory?.trim();
    const systemWithMemory = memory
      ? `${system}\n\nOrganization context (AI Memory):\n${memory}`
      : system;
    return this.run(await this.resolveTenantConfig(tenantId), systemWithMemory, user);
  }

  /** Общий путь: вызвать провайдера, при ошибке — залогировать и вернуть null (fallback). */
  private async run(cfg: LlmConfig, system: string, user: string): Promise<string | null> {
    try {
      return await callLlm(cfg, system, user);
    } catch (error) {
      this.logger.warn(
        `LLM-провайдер (${cfg.provider}) недоступен, fallback на детерминированный результат: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
