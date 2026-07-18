'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

export interface NewKeyState {
  key?: string;
  prefix?: string;
  name?: string;
  error?: string;
}

/** Сгенерировать API-ключ (T-090). Plaintext возвращается один раз — отдаём в state. */
export async function createApiKeyAction(
  _prev: NewKeyState,
  formData: FormData,
): Promise<NewKeyState> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return { error: 'no-tenant' };
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'empty' };
  const res = await apiFetch('/api-keys', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return { error: 'failed' };
  const created = (await res.json()) as { key: string; prefix: string; name: string };
  revalidatePath('/api-keys');
  return { key: created.key, prefix: created.prefix, name: created.name };
}

/** Отозвать API-ключ (T-090). */
export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/api-keys/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/api-keys');
}
