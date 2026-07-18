'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Аллокация ресурса на аудит (T-102). */
export async function createAllocationAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const engagementId = String(formData.get('engagementId') ?? '');
  const membershipId = String(formData.get('membershipId') ?? '');
  const allocatedHours = Number(formData.get('allocatedHours'));
  if (!engagementId || !membershipId || !Number.isFinite(allocatedHours) || allocatedHours <= 0) return;
  const period = String(formData.get('period') ?? '').trim();
  await apiFetch('/allocations', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engagementId,
      membershipId,
      allocatedHours,
      period: period || undefined,
    }),
  });
  revalidatePath('/allocations');
}
