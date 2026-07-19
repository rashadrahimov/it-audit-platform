import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { env } from '../env';

/**
 * Провайдер-абстракция LLM (EP-AI, T-H21). ВЫКЛЮЧЕНА по умолчанию (AI_PROVIDER=none):
 * enabled()=false, draftText()=null → вызывающий код падает на детерминированный fallback,
 * on-prem остаётся без ИИ (ADR-0002). Включение = env AI_PROVIDER=anthropic + ANTHROPIC_API_KEY.
 * Адаптер — Anthropic Claude; aiBaseUrl направляет на локальный Anthropic-совместимый прокси.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;

  constructor() {
    this.client =
      env.aiProvider === 'anthropic' && env.anthropicApiKey
        ? new Anthropic({
            apiKey: env.anthropicApiKey,
            ...(env.aiBaseUrl ? { baseURL: env.aiBaseUrl } : {}),
          })
        : null;
  }

  enabled(): boolean {
    return this.client !== null;
  }

  status() {
    return {
      enabled: this.enabled(),
      provider: env.aiProvider,
      model: this.enabled() ? env.aiModel : null,
    };
  }

  /**
   * Один запрос system+user → текст ответа, или null если ИИ выключен/ошибка провайдера
   * (тогда вызывающий использует детерминированный результат). Thinking выключен (короткая
   * генерация) + инструкция «только финальный текст», чтобы reasoning не попал в ответ.
   */
  async draftText(system: string, user: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const msg = await this.client.messages.create({
        model: env.aiModel,
        max_tokens: 1500,
        system: `${system}\n\nОтвечай ТОЛЬКО итоговым текстом, без преамбулы и рассуждений.`,
        messages: [{ role: 'user', content: user }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return text || null;
    } catch (error) {
      this.logger.warn(
        `LLM-провайдер недоступен, fallback на детерминированный результат: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
