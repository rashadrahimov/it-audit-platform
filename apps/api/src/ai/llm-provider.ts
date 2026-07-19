import Anthropic from '@anthropic-ai/sdk';

/** Провайдеры LLM. `openai_compat` покрывает GPT/Kimi/DeepSeek/Qwen/Ollama/vLLM/OpenRouter —
 *  всё, что говорит по OpenAI-совместимому /chat/completions (клиент задаёт baseUrl+model+key). */
export type LlmProviderKind = 'none' | 'anthropic' | 'openai_compat';

export interface LlmConfig {
  provider: LlmProviderKind;
  apiKey: string;
  /** Для openai_compat: база с /v1 (напр. https://api.moonshot.cn/v1, http://ollama:11434/v1). */
  baseUrl?: string;
  model: string;
}

export function isConfigured(cfg: LlmConfig): boolean {
  if (cfg.provider === 'none') return false;
  if (!cfg.apiKey) return false;
  if (cfg.provider === 'openai_compat' && !cfg.baseUrl) return false;
  return true;
}

const FINAL_ONLY = '\n\nОтвечай ТОЛЬКО итоговым текстом, без преамбулы и рассуждений.';

/**
 * Единая точка вызова LLM (EP-AI, T-H22): по конфигу выбирает адаптер. Возвращает текст
 * или null (провайдер не сконфигурирован — вызывающий падает на детерминированный fallback).
 * Ошибки провайдера пробрасываются — их ловит AiService и тоже уходит в fallback.
 */
export async function callLlm(
  cfg: LlmConfig,
  system: string,
  user: string,
): Promise<string | null> {
  if (!isConfigured(cfg)) return null;
  if (cfg.provider === 'anthropic') return callAnthropic(cfg, system, user);
  return callOpenAiCompat(cfg, system, user);
}

async function callAnthropic(cfg: LlmConfig, system: string, user: string): Promise<string | null> {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
  });
  const msg = await client.messages.create({
    model: cfg.model,
    max_tokens: 1500,
    system: system + FINAL_ONLY,
    messages: [{ role: 'user', content: user }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text || null;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

async function callOpenAiCompat(
  cfg: LlmConfig,
  system: string,
  user: string,
): Promise<string | null> {
  const res = await fetch(`${cfg.baseUrl!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: system + FINAL_ONLY },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM-провайдер ответил ${res.status}`);
  const data = (await res.json()) as ChatCompletion;
  return data.choices?.[0]?.message?.content?.trim() || null;
}
