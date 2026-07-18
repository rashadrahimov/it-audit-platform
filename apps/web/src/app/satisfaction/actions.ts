'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Оценка удовлетворённости аудитом 1-5 (T-097). */
export async function submitSurveyAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const engagementId = String(formData.get('engagementId') ?? '');
  const rating = Number(formData.get('rating'));
  if (!engagementId || !Number.isInteger(rating) || rating < 1 || rating > 5) return;
  const comment = String(formData.get('comment') ?? '').trim();
  await apiFetch('/satisfaction-surveys', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ engagementId, rating, comment: comment || undefined }),
  });
  revalidatePath('/satisfaction');
}
