'use server';

import { revalidatePath } from 'next/cache';
import { setFlash } from '@/lib/flash';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

const KINDS = new Set(['subsidiary', 'process', 'system', 'location', 'activity', 'function']);

export async function createUniverseNodeAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const kind = String(formData.get('kind') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const parentId = String(formData.get('parentId') ?? '').trim();
  if (!tenantSlug || !KINDS.has(kind) || !name) return;
  const res = await apiFetch('/universe', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      nameI18n: { en: name, ru: name, az: name },
      ...(parentId ? { parentId } : {}),
    }),
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'created' : 'failed');
  revalidatePath('/universe');
}

export async function moveUniverseNodeAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const parentId = String(formData.get('parentId') ?? '').trim();
  const res = await apiFetch(`/universe/${id}/move`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId: parentId || null }),
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'updated' : 'failed');
  revalidatePath('/universe');
}

export async function updateUniverseNodeAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const kind = String(formData.get('kind') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!tenantSlug || !KINDS.has(kind) || !name) return;
  const res = await apiFetch(`/universe/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, nameI18n: { en: name, ru: name, az: name } }),
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'updated' : 'failed');
  revalidatePath('/universe');
}

export async function deleteUniverseNodeAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const res = await apiFetch(`/universe/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'deleted' : 'failed');
  revalidatePath('/universe');
}
