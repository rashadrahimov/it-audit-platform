import { describe, expect, it } from 'vitest';
import { renderEmail, resolveLocalized } from '../src/email/email.templates';

describe('renderEmail', () => {
  it('рендерит шаблон на запрошенном языке с подстановкой', () => {
    const email = renderEmail('test-email', 'ru', { sentAt: '2026-07-17T00:00:00.000Z' });
    expect(email.subject).toContain('Тестовое письмо');
    expect(email.text).toContain('2026-07-17T00:00:00.000Z');
  });

  it('рендерит все языки продукта', () => {
    expect(renderEmail('test-email', 'en', { sentAt: 'x' }).subject).toContain('Test email');
    expect(renderEmail('test-email', 'az', { sentAt: 'x' }).subject).toContain('Test məktubu');
  });
});

describe('resolveLocalized', () => {
  it('падает обратно на EN при отсутствии перевода', () => {
    const localized = { en: 'hello', ru: 'привет' };
    expect(resolveLocalized(localized, 'az')).toBe('hello');
    expect(resolveLocalized(localized, 'ru')).toBe('привет');
  });
});
