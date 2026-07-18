import 'server-only';
import { cookies } from 'next/headers';
import { meResponseSchema, type MeResponse } from '@it-audit/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
export const SESSION_COOKIE = 'session';

/** Серверный fetch к API с Bearer из httpOnly-cookie (T-047). */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Текущий юзер по cookie; null — не залогинен/токен истёк. */
export async function getSessionUser(): Promise<MeResponse | null> {
  const store = await cookies();
  if (!store.get(SESSION_COOKIE)) return null;
  try {
    const res = await apiFetch('/auth/me');
    if (!res.ok) return null;
    const parsed = meResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
