'use server';

import { getTranslations } from 'next-intl/server';
import { ssoDispatchResponseSchema } from '@it-audit/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** Результат home-realm discovery по e-mail (V49, ADR-0021). */
export interface SsoDiscoveryState {
  decision?: 'password' | 'sso';
  providerLabel?: string;
  method?: 'oidc' | 'saml';
  email?: string;
  error?: string;
}

/** Спросить у API, как входить домену e-mail: паролем или через IdP тенанта. */
export async function ssoDiscoveryAction(
  _prev: SsoDiscoveryState,
  formData: FormData,
): Promise<SsoDiscoveryState> {
  const t = await getTranslations('auth');
  const email = String(formData.get('email') ?? '');

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/sso/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    });
  } catch {
    return { error: t('apiUnreachable') };
  }
  if (!response.ok) return { error: t('ssoBadEmail') };

  const parsed = ssoDispatchResponseSchema.safeParse(await response.json());
  if (!parsed.success) return { error: t('apiUnreachable') };

  if (parsed.data.dispatch === 'sso') {
    return {
      decision: 'sso',
      providerLabel: parsed.data.providerLabel,
      method: parsed.data.method,
      email,
    };
  }
  return { decision: 'password', email };
}
