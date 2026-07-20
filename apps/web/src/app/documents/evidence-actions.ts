'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V29: установить статус ревью evidence (Auditor View) для документа. */
export async function setEvidenceReviewAction(
  entityType: string,
  entityId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const status = String(formData.get('status') ?? '');
  if (!['not_ready', 'ready', 'flagged', 'accepted'].includes(status)) return;
  await apiFetch('/audit-firms/evidence', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId, status }),
  });
  revalidatePath('/documents');
}

/** T-V29: добавить аудиторскую фирму в реестр. */
export async function createAuditFirmAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const contactEmail = String(formData.get('contactEmail') ?? '').trim();
  await apiFetch('/audit-firms', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...(contactEmail ? { contactEmail } : {}) }),
  });
  revalidatePath('/documents');
}

/** T-V29: удалить аудиторскую фирму. */
export async function deleteAuditFirmAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/audit-firms/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/documents');
}
