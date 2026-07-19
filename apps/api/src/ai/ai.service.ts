import { Injectable, Logger } from '@nestjs/common';
import { env } from '../env';
import { callLlm, isConfigured, type LlmConfig, type LlmProviderKind } from './llm-provider';

/**
 * Ассист поверх LLM (EP-AI, T-H21/H22). Мульти-провайдер: Claude или любой OpenAI-совместимый
 * (GPT/Kimi/DeepSeek/Ollama/…). ВЫКЛЮЧЕН по умолчанию (AI_PROVIDER=none) → draftText()=null,
 * вызывающий падает на детерминированный fallback; on-prem остаётся без ИИ (ADR-0002).
 * Per-tenant override (T-H23) переопределяет env-конфиг в БД.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** Деплой-уровень: конфиг из env (дефолт для всех тенантов без своего override). */
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

  /** Текст ответа, или null если ИИ выключен/ошибка (→ детерминированный fallback вызывающего). */
  async draftText(system: string, user: string): Promise<string | null> {
    return this.run(this.envConfig(), system, user);
  }

  /** Общий путь: вызвать провайдера, при ошибке — залогировать и вернуть null (fallback). */
  async run(cfg: LlmConfig, system: string, user: string): Promise<string | null> {
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
