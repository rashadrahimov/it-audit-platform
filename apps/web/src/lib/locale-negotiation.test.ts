import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage, resolveRequestLocale } from './locale-negotiation';

describe('locale negotiation', () => {
  it('lets an explicit URL locale override cookie and browser language', () => {
    expect(
      resolveRequestLocale({
        queryLocale: 'ru',
        cookieLocale: 'en',
        acceptLanguage: 'az-AZ,az;q=0.9',
      }),
    ).toBe('ru');
  });

  it('keeps an explicit product locale cookie above browser language', () => {
    expect(resolveRequestLocale({ cookieLocale: 'ru', acceptLanguage: 'az-AZ,az;q=0.9' })).toBe(
      'ru',
    );
  });

  it('uses browser language on first visit when no locale cookie exists', () => {
    expect(resolveRequestLocale({ acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.2' })).toBe('ru');
    expect(resolveRequestLocale({ acceptLanguage: 'az-AZ,az;q=0.9,en;q=0.2' })).toBe('az');
  });

  it('respects quality weights and falls back to EN for unsupported languages', () => {
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9,az;q=0.7,ru;q=0.8')).toBe('ru');
    expect(localeFromAcceptLanguage('de-DE,fr-FR;q=0.9')).toBe('en');
  });
});
