'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V05: создать кастомную роль тенанта. */
export async function createRoleAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const en = String(formData.get('nameEn') ?? '').trim();
  if (!tenantSlug || !en) return;
  const ru = String(formData.get('nameRu') ?? '').trim();
  const az = String(formData.get('nameAz') ?? '').trim();
  const nameI18n: Record<string, string> = { en };
  if (ru) nameI18n.ru = ru;
  if (az) nameI18n.az = az;
  await apiFetch('/rbac/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ nameI18n }),
  });
  revalidatePath('/roles');
}

/** T-V05: выставить ячейку матрицы кастомной роли. */
export async function setRoleCellAction(roleId: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const resource = String(formData.get('resource') ?? '');
  const action = String(formData.get('action') ?? '');
  const level = String(formData.get('level') ?? '');
  if (!tenantSlug || !resource || !action || !level) return;
  await apiFetch(`/rbac/roles/${roleId}/cells`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ resource, action, level }),
  });
  revalidatePath('/roles');
}
