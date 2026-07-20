'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V48: выдать доступ (Manage access) membership на сущность. */
export async function grantAccessAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const entityType = String(formData.get('entityType') ?? '').trim();
  const entityId = String(formData.get('entityId') ?? '').trim();
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  const level = String(formData.get('level') ?? 'view').trim();
  const path = String(formData.get('path') ?? '').trim();
  if (!entityType || !entityId || !membershipId) return;
  await apiFetch('/entity-acl', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId, membershipId, level }),
  });
  if (path) revalidatePath(path);
}

/** T-V48: отозвать грант доступа. */
export async function revokeAccessAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '').trim();
  const path = String(formData.get('path') ?? '').trim();
  if (!id) return;
  await apiFetch(`/entity-acl/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (path) revalidatePath(path);
}
