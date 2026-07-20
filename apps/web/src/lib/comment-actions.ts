'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V10: добавить комментарий к любой сущности (полиморфный API T-023). */
export async function addEntityCommentAction(
  entityType: string,
  entityId: string,
  path: string,
  formData: FormData,
): Promise<void> {
  const body = String(formData.get('body') ?? '').trim();
  const tenantSlug = await getActiveTenantSlug();
  if (!body || !tenantSlug) return;
  await apiFetch('/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ entityType, entityId, body }),
  });
  revalidatePath(path);
}
