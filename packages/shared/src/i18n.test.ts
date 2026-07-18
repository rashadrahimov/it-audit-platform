import { describe, expect, it } from 'vitest';
import { i18nTextSchema, resolveLocalized } from './i18n';

describe('resolveLocalized (ADR-0009)', () => {
  const text = { en: 'Demo Bank', ru: 'Демо-банк' };

  it('отдаёт перевод на выбранном языке', () => {
    expect(resolveLocalized(text, 'ru')).toBe('Демо-банк');
  });

  it('fallback на EN, когда перевода нет', () => {
    expect(resolveLocalized(text, 'az')).toBe('Demo Bank');
  });

  it('en как выбранный язык', () => {
    expect(resolveLocalized(text, 'en')).toBe('Demo Bank');
  });
});

describe('i18nTextSchema', () => {
  it('en обязателен', () => {
    expect(i18nTextSchema.safeParse({ ru: 'без en' }).success).toBe(false);
    expect(i18nTextSchema.safeParse({ en: 'ok' }).success).toBe(true);
  });
});
