import { describe, expect, it } from 'vitest';
import { isConfigured, type LlmConfig } from '../src/ai/llm-provider';

/** DoD EP-AI (T-H22): gating мульти-провайдера — когда конфиг считается «включённым». */
describe('isConfigured — мульти-провайдер', () => {
  const base = (o: Partial<LlmConfig>): LlmConfig => ({
    provider: 'none',
    apiKey: '',
    model: 'm',
    ...o,
  });

  it('none → всегда выключен', () => {
    expect(isConfigured(base({ provider: 'none', apiKey: 'k' }))).toBe(false);
  });
  it('anthropic без ключа → выключен', () => {
    expect(isConfigured(base({ provider: 'anthropic', apiKey: '' }))).toBe(false);
  });
  it('anthropic с ключом → включён', () => {
    expect(isConfigured(base({ provider: 'anthropic', apiKey: 'k' }))).toBe(true);
  });
  it('openai_compat без baseUrl → выключен (нужен endpoint)', () => {
    expect(isConfigured(base({ provider: 'openai_compat', apiKey: 'k' }))).toBe(false);
  });
  it('openai_compat с baseUrl+ключом → включён (GPT/Kimi/DeepSeek/Ollama)', () => {
    expect(
      isConfigured(base({ provider: 'openai_compat', apiKey: 'k', baseUrl: 'http://x/v1' })),
    ).toBe(true);
  });
});
