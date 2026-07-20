'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать изменение (T-063). */
export async function createChangeAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const type = String(formData.get('type') ?? '').trim();
  const assetId = String(formData.get('assetId') ?? '').trim();
  await apiFetch('/changes', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      type: type || undefined,
      risk: String(formData.get('risk') ?? 'medium'),
      assetId: assetId || undefined,
    }),
  });
  revalidatePath('/code-changes');
}

/** Workflow изменения: requested→approved/rejected→deployed (T-063). */
export async function transitionChangeAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await apiFetch(`/changes/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/code-changes');
}
