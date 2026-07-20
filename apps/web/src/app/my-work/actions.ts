'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V18: подтвердить ознакомление с политикой прямо из My Work. */
export async function attestFromMyWorkAction(policyId: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/policies/${policyId}/attest`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/my-work');
}

/** T-V07: self-service запрос доступа из My Work (POST под control.view). */
export async function requestAccessAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const system = String(formData.get('system') ?? '').trim();
  if (!tenantSlug || !system) return;
  const justification = String(formData.get('justification') ?? '').trim();
  await apiFetch('/access-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ system, justification: justification || undefined }),
  });
  revalidatePath('/my-work');
}
