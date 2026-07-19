import { describe, expect, it } from 'vitest';
import { AiService } from '../src/ai/ai.service';

/**
 * DoD EP-AI (T-H21): каркас LLM ВЫКЛЮЧЕН по умолчанию (AI_PROVIDER не задан в тестовом env).
 * Инвариант: on-prem/дефолт остаётся без ИИ (ADR-0002), детерминированный fallback работает.
 */
describe('AiService — off by default', () => {
  const svc = new AiService();

  it('enabled()=false и status() без модели, когда провайдер не сконфигурирован', () => {
    expect(svc.enabled()).toBe(false);
    expect(svc.status()).toEqual({ enabled: false, provider: 'none', model: null });
  });

  it('draftText() возвращает null, когда ИИ выключен (вызывающий → детерминированный fallback)', async () => {
    expect(await svc.draftText('system', 'user')).toBeNull();
  });
});
