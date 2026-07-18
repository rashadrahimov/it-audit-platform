'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

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
