'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать вендора (T-060). */
export async function createVendorAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const inherentRisk = String(formData.get('inherentRisk') ?? 'medium');
  await apiFetch('/vendors', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, inherentRisk }),
  });
  revalidatePath('/vendors');
}

/** Lifecycle-переход вендора: procurement→active→archived (T-060). */
export async function transitionVendorAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await apiFetch(`/vendors/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/vendors');
}
