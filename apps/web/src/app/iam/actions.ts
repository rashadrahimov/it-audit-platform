'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Деактивировать аккаунт (T-054). */
export async function deactivateAccountAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/accounts/${id}/deactivate`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/iam');
}

/** Решение по запросу доступа: approve/reject (T-056). */
export async function decideAccessRequestAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!id || !decision) return;
  await apiFetch(`/access-requests/${id}/decision`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  revalidatePath('/iam');
}

/** T-V07: назначить owner аккаунта. */
export async function setAccountOwnerAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '');
  if (!tenantSlug || !ownerMembershipId) return;
  await apiFetch(`/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerMembershipId }),
  });
  revalidatePath('/iam');
}

/** T-V07: создать deprovisioning-задачу. */
export async function createDeprovisioningAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const accountId = String(formData.get('accountId') ?? '');
  if (!tenantSlug || !accountId) return;
  const reason = String(formData.get('reason') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '');
  await apiFetch('/deprovisioning-tasks', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      reason: reason || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    }),
  });
  revalidatePath('/iam');
}

/** T-V07: закрыть deprovisioning-задачу (аккаунт деактивируется). */
export async function completeDeprovisioningAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/deprovisioning-tasks/${id}/complete`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/iam');
}
