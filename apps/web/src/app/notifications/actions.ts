'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Отметить уведомление прочитанным (T-096). */
export async function markReadAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/notifications/${id}/read`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/notifications');
}
