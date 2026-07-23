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
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  await apiFetch('/questionnaires', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      source: source || undefined,
      ownerMembershipId: ownerMembershipId || undefined,
      dueDate: dueDate ? new Date(`${dueDate}T17:00:00.000Z`).toISOString() : undefined,
    }),
  });
  revalidatePath('/questionnaires');
}

/** T-V42: создать опросник и импортировать уникальные вопросы из .xlsx. */
export async function importQuestionnaireAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const file = formData.get('file');
  const title = String(formData.get('title') ?? '').trim();
  if (!(file instanceof File) || file.size === 0 || !title) return;
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  const payload = new FormData();
  payload.append('file', file);
  payload.append('title', title);
  for (const name of ['source', 'ownerMembershipId']) {
    const value = String(formData.get(name) ?? '').trim();
    if (value) payload.append(name, value);
  }
  if (dueDate) payload.append('dueDate', new Date(`${dueDate}T17:00:00.000Z`).toISOString());
  await apiFetch('/questionnaires/import', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
    body: payload,
  });
  revalidatePath('/questionnaires');
}
