import type { SsoDispatchResponse, SsoMethod } from '@it-audit/shared';

/**
 * Чистые примитивы home-realm discovery (V49, ADR-0021): по e-mail — домен, и по
 * найденному конфигу — решение «пароль или увести на IdP». Без БД → юнит-тесты.
 */

/** Домен e-mail в нижнем регистре (часть после последней @). null — если не e-mail. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .toLowerCase()
    .trim();
}

/** init-маршрут API для метода IdP. */
export function ssoInitPath(method: SsoMethod): string {
  return method === 'saml' ? '/auth/saml/login' : '/auth/oidc/login';
}

export interface DispatchConfig {
  method: SsoMethod;
  providerLabel: string;
  enabled: boolean;
}

/** Решение диспатча: включённый конфиг для домена → sso, иначе → пароль. */
export function resolveDispatch(config: DispatchConfig | null | undefined): SsoDispatchResponse {
  if (!config || !config.enabled) return { dispatch: 'password' };
  return {
    dispatch: 'sso',
    method: config.method,
    providerLabel: config.providerLabel,
    redirectPath: ssoInitPath(config.method),
  };
}
