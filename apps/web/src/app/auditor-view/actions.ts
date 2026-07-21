'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

export interface FormState {
  ok?: boolean;
  error?: string;
}

/** T-112: аудитор меняет review-статус доказательства. */
export async function setReviewStatusAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const linkId = String(formData.get('linkId') ?? '');
  const reviewStatus = String(formData.get('reviewStatus') ?? '');
  if (!linkId || !reviewStatus) return;
  await apiFetch(`/documents/links/${linkId}/review`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewStatus }),
  });
  revalidatePath('/auditor-view');
}

/** T-114: аудитор принимает предоставленное доказательство. */
export async function acceptRequestAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/evidence-requests/${id}/accept`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/auditor-view');
}

/** T-114: аудитор создаёт запрос доказательства (PBC). */
export async function createRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return { error: 'no-tenant' };
  const engagementId = String(formData.get('engagementId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (!engagementId || !title) return { error: 'empty' };
  const assigneeMembershipId = String(formData.get('assigneeMembershipId') ?? '');
  const description = String(formData.get('description') ?? '').trim();
  const res = await apiFetch('/evidence-requests', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engagementId,
      title,
      ...(description ? { description } : {}),
      ...(assigneeMembershipId ? { assigneeMembershipId } : {}),
    }),
  });
  if (!res.ok) return { error: 'failed' };
  revalidatePath('/auditor-view');
  return { ok: true };
}

/** T-H37: создать запрос из AI-подсказки DRL без client-state формы. */
export async function createSuggestedRequestAction(formData: FormData): Promise<void> {
  await createRequestAction({}, formData);
}

/** T-113: аудитор добавляет вердикт по пункту аудита (новый раунд). */
export async function addAssessmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return { error: 'no-tenant' };
  const targetId = String(formData.get('targetId') ?? '');
  const verdict = String(formData.get('verdict') ?? '');
  if (!targetId || !verdict) return { error: 'empty' };
  const note = String(formData.get('note') ?? '').trim();
  const res = await apiFetch('/auditor-assessments', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType: 'finding', targetId, verdict, ...(note ? { note } : {}) }),
  });
  if (!res.ok) return { error: 'failed' };
  revalidatePath('/auditor-view');
  return { ok: true };
}
