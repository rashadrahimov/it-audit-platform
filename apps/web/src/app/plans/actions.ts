'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать годовой план (T-100). */
export async function createPlanAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const year = Number(formData.get('year'));
  const capacityHours = Number(formData.get('capacityHours'));
  await apiFetch('/plans', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      year: Number.isInteger(year) ? year : undefined,
      capacityHours: Number.isFinite(capacityHours) && capacityHours >= 0 ? capacityHours : undefined,
    }),
  });
  revalidatePath('/plans');
}

/** Добавить узел universe в план (T-100, приоритет считается по риску). */
export async function addPlanItemAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const auditableEntityId = String(formData.get('auditableEntityId') ?? '');
  if (!id || !auditableEntityId) return;
  const plannedHours = Number(formData.get('plannedHours'));
  const plannedQuarter = String(formData.get('plannedQuarter') ?? '').trim();
  await apiFetch(`/plans/${id}/items`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auditableEntityId,
      plannedHours: Number.isFinite(plannedHours) && plannedHours >= 0 ? plannedHours : undefined,
      plannedQuarter: plannedQuarter || undefined,
    }),
  });
  revalidatePath('/plans');
}
