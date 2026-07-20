'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать вендора (T-060; категория из справочника — T-V13). */
export async function createVendorAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const inherentRisk = String(formData.get('inherentRisk') ?? 'medium');
  const category = String(formData.get('category') ?? '').trim();
  await apiFetch('/vendors', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, inherentRisk, ...(category ? { category } : {}) }),
  });
  revalidatePath('/vendors');
}

/** Редактировать вендора (T-V13): атрибуты/риски/security owner. */
export async function updateVendorAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body: Record<string, unknown> = {};
  const name = String(formData.get('name') ?? '').trim();
  if (name) body.name = name;
  const CLASSES = ['low', 'medium', 'high', 'critical'];
  const inherentRisk = String(formData.get('inherentRisk') ?? '');
  if (CLASSES.includes(inherentRisk)) body.inherentRisk = inherentRisk;
  const residualRisk = String(formData.get('residualRisk') ?? '');
  if (CLASSES.includes(residualRisk)) body.residualRisk = residualRisk;
  if (formData.has('category'))
    body.category = String(formData.get('category') ?? '').trim() || null;
  if (formData.has('url')) body.url = String(formData.get('url') ?? '').trim() || null;
  if (formData.has('securityOwnerMembershipId')) {
    const owner = String(formData.get('securityOwnerMembershipId') ?? '');
    body.securityOwnerMembershipId = owner || null;
  }
  if (Object.keys(body).length === 0) return;
  await apiFetch(`/vendors/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath(`/vendors/${id}`);
  revalidatePath('/vendors');
}

/** Intake-анкета вендора (T-V13): фиксированные поля в jsonb intake. */
export async function saveVendorIntakeAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const intake: Record<string, string> = {};
  for (const k of ['businessPurpose', 'dataTypes', 'dataClassification', 'authMethod', 'notes']) {
    const v = String(formData.get(k) ?? '').trim();
    if (v) intake[k] = v;
  }
  await apiFetch(`/vendors/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ intake }),
  });
  revalidatePath(`/vendors/${id}`);
}

/** Создать оценку вендора (T-061 → UI T-V13). */
export async function createAssessmentAction(vendorId: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const type = String(formData.get('type') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '');
  await apiFetch(`/vendors/${vendorId}/assessments`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(type ? { type } : {}),
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
    }),
  });
  revalidatePath(`/vendors/${vendorId}`);
}

/** Workflow оценки (T-061): requested→in_progress→completed (+recommendation). */
export async function transitionAssessmentAction(
  vendorId: string,
  assessmentId: string,
  to: 'in_progress' | 'completed',
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const recommendation = String(formData.get('recommendation') ?? '').trim();
  await apiFetch(`/vendors/assessments/${assessmentId}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, ...(recommendation ? { recommendation } : {}) }),
  });
  revalidatePath(`/vendors/${vendorId}`);
}

/** Прикрепить evidence-документ к оценке (полиморфный document_link, T-034). */
export async function attachAssessmentDocumentAction(
  vendorId: string,
  assessmentId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const documentId = String(formData.get('documentId') ?? '');
  if (!documentId) return;
  await apiFetch(`/documents/${documentId}/links`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType: 'vendor_assessment', entityId: assessmentId }),
  });
  revalidatePath(`/vendors/${vendorId}`);
}

/** Lifecycle-переход вендора: procurement→active→archived (T-060). */
export async function transitionVendorAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await apiFetch(`/vendors/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/vendors');
  revalidatePath(`/vendors/${id}`);
}
