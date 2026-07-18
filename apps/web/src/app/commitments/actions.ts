'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать контрактное обязательство из формы (T-077). */
export async function createCommitmentAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const source = String(formData.get('source') ?? '').trim();
  await apiFetch('/commitments', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, source: source || undefined }),
  });
  revalidatePath('/commitments');
}

/** Сменить статус обязательства (met/at_risk/breached). */
export async function setCommitmentStatusAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !status) return;
  await apiFetch(`/commitments/${id}/status`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  revalidatePath('/commitments');
}
