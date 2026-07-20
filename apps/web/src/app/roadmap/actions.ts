'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V33: установить целевую дату audit-ready фреймворка. */
export async function setTargetDateAction(activationId: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const raw = String(formData.get('targetDate') ?? '').trim();
  const targetDate = raw ? new Date(raw).toISOString() : null;
  await apiFetch(`/roadmap/${activationId}/target`, {
    method: 'PUT',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDate }),
  });
  revalidatePath('/roadmap');
}
