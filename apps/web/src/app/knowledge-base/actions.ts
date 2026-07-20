'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать KB-запись (T-082, T-V43 — owner + срок). */
export async function createKbAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const question = String(formData.get('question') ?? '').trim();
  const answer = String(formData.get('answer') ?? '').trim();
  if (!question || !answer) return;
  const category = String(formData.get('category') ?? '').trim();
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '').trim();
  const expiresAt = String(formData.get('expiresAt') ?? '').trim();
  await apiFetch('/kb', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      answer,
      ...(category ? { category } : {}),
      ...(ownerMembershipId ? { ownerMembershipId } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    }),
  });
  revalidatePath('/knowledge-base');
}

/** T-V43: правка KB-записи — owner и срок годности. T-V54: публикация в Trust Center. */
export async function updateKbAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '').trim();
  const expiresAt = String(formData.get('expiresAt') ?? '').trim();
  // checkbox: присутствует в форме только когда отмечен
  const trustVisible = formData.get('trustVisible') != null;
  await apiFetch(`/kb/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerMembershipId: ownerMembershipId || null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      trustVisible,
    }),
  });
  revalidatePath('/knowledge-base');
}
