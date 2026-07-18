'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Переход уязвимости: open→remediating→resolved (T-062). */
export async function transitionVulnAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await apiFetch(`/vulnerabilities/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/vulnerabilities');
}
