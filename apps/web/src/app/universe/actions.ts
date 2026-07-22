'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

const KINDS = new Set(['subsidiary', 'process', 'system', 'location', 'activity', 'function']);

export async function createUniverseNodeAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const kind = String(formData.get('kind') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const parentId = String(formData.get('parentId') ?? '').trim();
  if (!tenantSlug || !KINDS.has(kind) || !name) return;
  await apiFetch('/universe', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      nameI18n: { en: name, ru: name, az: name },
      ...(parentId ? { parentId } : {}),
    }),
  });
  revalidatePath('/universe');
}

export async function moveUniverseNodeAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const parentId = String(formData.get('parentId') ?? '').trim();
  await apiFetch(`/universe/${id}/move`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId: parentId || null }),
  });
  revalidatePath('/universe');
}
