'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать KB-запись (T-082). */
export async function createKbAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const question = String(formData.get('question') ?? '').trim();
  const answer = String(formData.get('answer') ?? '').trim();
  if (!question || !answer) return;
  const category = String(formData.get('category') ?? '').trim();
  await apiFetch('/kb', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, answer, category: category || undefined }),
  });
  revalidatePath('/knowledge-base');
}
