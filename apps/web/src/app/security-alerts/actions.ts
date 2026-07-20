'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V40: зафиксировать security alert вручную — категория, актив, severity (resolution SLA). */
export async function createAlertAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const category = String(formData.get('category') ?? '').trim();
  const assetId = String(formData.get('assetId') ?? '').trim();
  await apiFetch('/security-alerts', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      severity: String(formData.get('severity') ?? 'medium'),
      category: category || undefined,
      assetId: assetId || undefined,
    }),
  });
  revalidatePath('/security-alerts');
}

/** Триаж security alert: new→triaged→closed (T-064). */
export async function transitionAlertAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await apiFetch(`/security-alerts/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/security-alerts');
}
