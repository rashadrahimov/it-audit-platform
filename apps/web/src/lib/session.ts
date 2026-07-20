import 'server-only';
import { cookies } from 'next/headers';
import { meResponseSchema, meTenantsResponseSchema, type MeResponse } from '@it-audit/shared';

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

/** Активный тенант юзера (T-032): первый membership; полноценный переключатель — позже. */
export async function getActiveTenantSlug(): Promise<string | null> {
  try {
    const res = await apiFetch('/auth/me/tenants');
    if (!res.ok) return null;
    const parsed = meTenantsResponseSchema.safeParse(await res.json());
    return parsed.success ? (parsed.data[0]?.slug ?? null) : null;
  } catch {
    return null;
  }
}

/** T-V50: category membership в активном тенанте (internal|auditor) — для scoped-nav. */
export async function getActiveTenantCategory(): Promise<string> {
  try {
    const res = await apiFetch('/auth/me/tenants');
    if (!res.ok) return 'internal';
    const parsed = meTenantsResponseSchema.safeParse(await res.json());
    return parsed.success ? (parsed.data[0]?.category ?? 'internal') : 'internal';
  } catch {
    return 'internal';
  }
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
