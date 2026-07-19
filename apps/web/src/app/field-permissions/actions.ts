'use server';

import { revalidatePath } from 'next/cache';
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
  await apiFetch('/field-permissions', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId, entityType, field, level }),
  });
  revalidatePath('/field-permissions');
}

/** Снять field-level право (SEC-04). */
export async function deleteFieldPermAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/field-permissions/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/field-permissions');
}
