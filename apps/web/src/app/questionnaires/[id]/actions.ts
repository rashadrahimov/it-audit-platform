'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V42: назначить владельца и срок опросника. */
export async function updateQuestionnaireAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const id = String(formData.get('id') ?? '');
  if (!tenantSlug || !id) return;
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  await apiFetch(`/questionnaires/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerMembershipId: ownerMembershipId || null,
      dueDate: dueDate ? new Date(`${dueDate}T17:00:00.000Z`).toISOString() : null,
    }),
  });
  revalidatePath(`/questionnaires/${id}`);
  revalidatePath('/questionnaires');
}

/** Добавить вопрос в опросник (T-083). */
export async function addQuestionAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const question = String(formData.get('question') ?? '').trim();
  if (!id || !question) return;
  await apiFetch(`/questionnaires/${id}/questions`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  revalidatePath(`/questionnaires/${id}`);
}

/** Ответить на вопрос (T-083). */
export async function answerAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const answerId = String(formData.get('answerId') ?? '');
  const answer = String(formData.get('answer') ?? '').trim();
  if (!id || !answerId || !answer) return;
  await apiFetch(`/questionnaires/answers/${answerId}`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
  revalidatePath(`/questionnaires/${id}`);
}

/** T-V42: один клик — применить предложенный KB-ответ (reuse через kbEntryId). */
export async function useKbSuggestionAction(
  id: string,
  answerId: string,
  kbEntryId: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug || !kbEntryId) return;
  await apiFetch(`/questionnaires/answers/${answerId}`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kbEntryId }),
  });
  revalidatePath(`/questionnaires/${id}`);
}

/** Отправить опросник — все вопросы должны быть отвечены (T-083). */
export async function submitQuestionnaireAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/questionnaires/${id}/submit`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/questionnaires/${id}`);
}
