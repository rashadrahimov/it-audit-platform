'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  authTokenResponseSchema,
  loginResponseSchema,
  localeSchema,
  meResponseSchema,
  mfaChallengeResponseSchema,
} from '@it-audit/shared';
import { getCurrentLocale } from '@/lib/locale';
import { apiFetch, getActiveTenantSlug, SESSION_COOKIE } from '@/lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * T-V36f/T-H113: на входе синхронизируем cookie `locale` с языком профиля
 * пользователя, чтобы старый браузерный EN не перебивал RU/AZ демо и клиентские
 * аккаунты. После входа ручной переключатель языка всё равно может изменить cookie.
 * Hot-path i18n не трогаем — ставим только на входе. Best-effort.
 */
async function applyTenantLocale(accessToken?: string): Promise<void> {
  try {
    const store = await cookies();
    if (accessToken) {
      const meRes = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (meRes.ok) {
        const me = meResponseSchema.safeParse(await meRes.json());
        if (me.success) {
          store.set('locale', me.data.locale, {
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
          });
          return;
        }
      }
    }
    const slug = await getActiveTenantSlug();
    if (!slug) return;
    const res = await apiFetch('/business-profile', { headers: { 'X-Tenant-Slug': slug } });
    if (!res.ok) return;
    const parsed = localeSchema.safeParse((await res.json()).defaultLocale);
    if (parsed.success) {
      store.set('locale', parsed.data, { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
  } catch {
    // best-effort — локаль не критична для логина
  }
}

/** Состояние формы логина: ошибка и/или активный MFA-челлендж (T-047). */
export interface LoginFormState {
  error?: string;
  mfaToken?: string;
}

async function setSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure по фактическому протоколу деплоя (APP_URL): http → false (иначе браузер
    // выбрасывает куку и логин зациклен), https → true. Дев (нет APP_URL) → false.
    secure: (process.env.APP_URL ?? '').startsWith('https:'),
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const t = await getTranslations('auth');
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { error: t('apiUnreachable') };
  }
  if (!response.ok) return { error: t('badCredentials') };

  const parsed = loginResponseSchema.safeParse(await response.json());
  if (!parsed.success) return { error: t('apiUnreachable') };

  const mfa = mfaChallengeResponseSchema.safeParse(parsed.data);
  if (mfa.success) return { mfaToken: mfa.data.mfaToken };

  const token = authTokenResponseSchema.parse(parsed.data);
  await setSessionCookie(token.accessToken, token.expiresInSeconds);
  await applyTenantLocale(token.accessToken);
  redirect('/account');
}

export async function mfaVerifyAction(
  prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const t = await getTranslations('auth');
  const mfaToken = String(formData.get('mfaToken') ?? '');
  const code = String(formData.get('code') ?? '');

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken, code }),
      cache: 'no-store',
    });
  } catch {
    return { error: t('apiUnreachable'), mfaToken };
  }
  // истёкший челлендж (5 мин) — назад на первый шаг
  if (response.status === 401 && !code) return { error: t('badCode'), mfaToken };
  if (!response.ok) return { error: t('badCode'), mfaToken };

  const parsed = authTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) return { error: t('apiUnreachable'), mfaToken };
  await setSessionCookie(parsed.data.accessToken, parsed.data.expiresInSeconds);
  await applyTenantLocale(parsed.data.accessToken);
  redirect('/account');
}

/** Состояние формы запроса magic-link: письмо отправлено и/или ошибка сети. */
export interface MagicRequestState {
  sent?: boolean;
  error?: string;
}

/** Запрос passwordless-ссылки. Успех «тихий» — существование аккаунта не раскрываем. */
export async function magicLinkRequestAction(
  _prev: MagicRequestState,
  formData: FormData,
): Promise<MagicRequestState> {
  const t = await getTranslations('auth');
  const email = String(formData.get('email') ?? '');
  const locale = await getCurrentLocale();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/magic-link/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, locale }),
      cache: 'no-store',
    });
  } catch {
    return { error: t('apiUnreachable') };
  }
  if (!response.ok) return { error: t('apiUnreachable') };
  return { sent: true };
}

/** Состояние обмена magic-link на сессию: активный MFA-челлендж и/или ошибка. */
export interface MagicConsumeState {
  mfaToken?: string;
  error?: string;
}

/** Обмен ссылки на сессию. Токен → cookie+redirect; MFA-аккаунт → второй шаг. */
export async function magicConsumeAction(
  _prev: MagicConsumeState,
  formData: FormData,
): Promise<MagicConsumeState> {
  const t = await getTranslations('auth');
  const token = String(formData.get('token') ?? '');
  if (!token) return { error: t('magicInvalid') };

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/magic-link/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
  } catch {
    return { error: t('apiUnreachable') };
  }
  if (!response.ok) return { error: t('magicInvalid') };

  const parsed = loginResponseSchema.safeParse(await response.json());
  if (!parsed.success) return { error: t('apiUnreachable') };

  const mfa = mfaChallengeResponseSchema.safeParse(parsed.data);
  if (mfa.success) return { mfaToken: mfa.data.mfaToken };

  const token2 = authTokenResponseSchema.parse(parsed.data);
  await setSessionCookie(token2.accessToken, token2.expiresInSeconds);
  await applyTenantLocale(token2.accessToken);
  redirect('/account');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
