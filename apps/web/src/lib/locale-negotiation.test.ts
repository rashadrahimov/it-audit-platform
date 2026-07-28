import { describe, expect, it } from 'vitest';
import {
  isEnglishByDefaultPath,
  localeFromAcceptLanguage,
  resolveRequestLocale,
} from './locale-negotiation';

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

  it('login page defaults to English regardless of cookie and browser language', () => {
    expect(
      resolveRequestLocale({
        cookieLocale: 'ru',
        acceptLanguage: 'az-AZ,az;q=0.9',
        pathname: '/login',
      }),
    ).toBe('en');
    expect(resolveRequestLocale({ acceptLanguage: 'ru-RU,ru;q=0.9', pathname: '/login' })).toBe(
      'en',
    );
  });

  it('explicit locale still wins on the login page (language switcher keeps ?locale=)', () => {
    expect(
      resolveRequestLocale({ queryLocale: 'ru', cookieLocale: 'en', pathname: '/login' }),
    ).toBe('ru');
  });

  it('other pages keep honouring the cookie', () => {
    expect(
      resolveRequestLocale({ cookieLocale: 'ru', acceptLanguage: 'en-US', pathname: '/incidents' }),
    ).toBe('ru');
    expect(resolveRequestLocale({ cookieLocale: 'az', pathname: '/' })).toBe('az');
  });

  it('распознаёт только страницу логина и её подпути', () => {
    expect(isEnglishByDefaultPath('/login')).toBe(true);
    expect(isEnglishByDefaultPath('/login/magic')).toBe(true);
    expect(isEnglishByDefaultPath('/logins')).toBe(false);
    expect(isEnglishByDefaultPath('/incidents')).toBe(false);
    expect(isEnglishByDefaultPath(null)).toBe(false);
  });
});
