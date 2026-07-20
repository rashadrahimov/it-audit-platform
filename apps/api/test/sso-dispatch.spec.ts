import { describe, expect, it } from 'vitest';
import { emailDomain, resolveDispatch, ssoInitPath } from '../src/auth/sso-dispatch';

describe('sso-dispatch', () => {
  it('emailDomain: домен в нижнем регистре', () => {
    expect(emailDomain('Ivan@Acme.COM')).toBe('acme.com');
    expect(emailDomain('a@b@corp.io')).toBe('corp.io'); // по последней @
  });

  it('emailDomain: не e-mail → null', () => {
    expect(emailDomain('notanemail')).toBeNull();
    expect(emailDomain('trailing@')).toBeNull();
  });

  it('ssoInitPath: метод → маршрут', () => {
    expect(ssoInitPath('oidc')).toBe('/auth/oidc/login');
    expect(ssoInitPath('saml')).toBe('/auth/saml/login');
  });

  it('resolveDispatch: включённый конфиг → sso с redirectPath', () => {
    const r = resolveDispatch({ method: 'oidc', providerLabel: 'KC', enabled: true });
    expect(r).toEqual({
      dispatch: 'sso',
      method: 'oidc',
      providerLabel: 'KC',
      redirectPath: '/auth/oidc/login',
    });
  });

  it('resolveDispatch: нет конфига или выключен → password', () => {
    expect(resolveDispatch(null)).toEqual({ dispatch: 'password' });
    expect(resolveDispatch({ method: 'saml', providerLabel: 'X', enabled: false })).toEqual({
      dispatch: 'password',
    });
  });
});
