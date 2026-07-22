'use server';

import { revalidatePath } from 'next/cache';
import { setFlash } from '@/lib/flash';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Задать/обновить field-level право роли тенанта (SEC-04, T-H07). */
export async function upsertFieldPermAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const roleId = String(formData.get('roleId') ?? '');
  const entityType = String(formData.get('entityType') ?? '').trim();
  const field = String(formData.get('field') ?? '').trim();
  const level = String(formData.get('level') ?? 'hidden');
  if (!roleId || !entityType || !field) return;
  const res = await apiFetch('/field-permissions', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId, entityType, field, level }),
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'saved' : 'failed');
  revalidatePath('/field-permissions');
}

/** Снять field-level право (SEC-04). */
export async function deleteFieldPermAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const res = await apiFetch(`/field-permissions/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'deleted' : 'failed');
  revalidatePath('/field-permissions');
}
