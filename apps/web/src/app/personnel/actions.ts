'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V26: сменить статус занятости — onboarding/offboarded сеют чеклист, offboarded деактивирует membership. */
export async function setPersonnelStatusAction(id: string, status: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  if (!['active', 'onboarding', 'offboarded'].includes(status)) return;
  await apiFetch(`/personnel/${id}/status`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  revalidatePath('/personnel');
}

/** T-V26: создать департамент (Groups). */
export async function createDepartmentAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  await apiFetch('/personnel/departments', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  revalidatePath('/personnel');
}

/** T-V26: удалить департамент. */
export async function deleteDepartmentAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/personnel/departments/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/personnel');
}
