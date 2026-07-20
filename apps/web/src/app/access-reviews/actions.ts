'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V08: создать UAR-кампанию из UI (пустой scope = все активные аккаунты). */
export async function createAccessReviewAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const title = String(formData.get('title') ?? '').trim();
  if (!tenantSlug || !title) return;
  const accountIds = formData.getAll('accountId').map(String).filter(Boolean);
  const dueDate = String(formData.get('dueDate') ?? '');
  await apiFetch('/access-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({
      title,
      accountIds: accountIds.length ? accountIds : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    }),
  });
  revalidatePath('/access-reviews');
}

/** T-V08: решение reviewer по пункту — certify/revoke/modify. */
export async function decideReviewItemAction(
  reviewId: string,
  itemId: string,
  decision: 'certify' | 'revoke' | 'modify',
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/access-reviews/${reviewId}/items/${itemId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ decision }),
  });
  revalidatePath(`/access-reviews/${reviewId}`);
}
