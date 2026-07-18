'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать опросник (T-083). */
export async function createQuestionnaireAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const source = String(formData.get('source') ?? '').trim();
  await apiFetch('/questionnaires', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, source: source || undefined }),
  });
  revalidatePath('/questionnaires');
}
