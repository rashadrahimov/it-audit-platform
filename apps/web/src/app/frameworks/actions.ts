'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Активировать фреймворк из каталога (T-V25, «Add framework»). */
export async function activateFrameworkAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/frameworks/${id}/activate`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/frameworks');
  revalidatePath(`/frameworks/${id}`);
}

/** Деактивировать фреймворк (вернуть в Available, T-V25). */
export async function deactivateFrameworkAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/frameworks/${id}/activate`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/frameworks');
  revalidatePath(`/frameworks/${id}`);
}
