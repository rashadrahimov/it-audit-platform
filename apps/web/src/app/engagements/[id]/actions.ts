'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Чеклист (T-036): добавить выбранные контроли снапшотами. */
export async function addChecklistItemsAction(
  engagementId: string,
  formData: FormData,
): Promise<void> {
  const controlIds = formData.getAll('controlId').map(String).filter(Boolean);
  const tenantSlug = await getActiveTenantSlug();
  if (controlIds.length === 0 || !tenantSlug) return;
  await apiFetch(`/engagements/${engagementId}/checklist-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ controlIds }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** Переход state machine из UI (T-035); ошибки перехода видны при обновлении страницы. */
export async function transitionAction(engagementId: string, to: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/engagements/${engagementId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ to }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}
