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

export interface SetTenantAiConfig {
  provider: LlmProviderKind;
  baseUrl?: string;
  model?: string;
  /** Пустой/отсутствует на update → оставить существующий ключ. */
  apiKey?: string;
  /** T-V36b: AI Memory — контекст тенанта в промпт. */
  memory?: string;
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
