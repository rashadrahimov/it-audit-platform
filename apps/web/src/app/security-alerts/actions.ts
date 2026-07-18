'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

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
