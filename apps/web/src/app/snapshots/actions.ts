'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V34: зафиксировать снапшот — заморозить метрики + состав открытых findings на дату. */
export async function createSnapshotAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return;
  await apiFetch('/snapshots', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  revalidatePath('/snapshots');
}
