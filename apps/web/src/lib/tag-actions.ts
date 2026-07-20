'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V36d: навесить тег на сущность. */
export async function attachTagAction(
  entityType: string,
  entityId: string,
  path: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const tagId = String(formData.get('tagId') ?? '').trim();
  if (!tagId) return;
  await apiFetch(`/tags/${tagId}/attach`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId }),
  });
  revalidatePath(path);
}

/** T-V36d: снять тег с сущности. */
export async function detachTagAction(
  tagId: string,
  entityType: string,
  entityId: string,
  path: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/tags/${tagId}/attach`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId }),
  });
  revalidatePath(path);
}
