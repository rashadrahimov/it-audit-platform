'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V01: загрузка документа-доказательства из UI (+опциональная привязка «type:id»). */
export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const file = formData.get('file');
  if (!tenantSlug || !(file instanceof File) || file.size === 0) return;

  const fd = new FormData();
  fd.append('file', file);
  const renewBy = String(formData.get('renewBy') ?? '');
  if (renewBy) fd.append('renewBy', new Date(renewBy).toISOString());
  const target = String(formData.get('target') ?? '');
  const [entityType, entityId] = target.includes(':') ? target.split(':', 2) : ['', ''];
  if (entityType && entityId) {
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    fd.append('relation', 'evidence');
  }
  await apiFetch('/documents', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
    body: fd,
  });
  revalidatePath('/documents');
}

/** T-V01: переназначить owner документа (админ). */
export async function reassignDocumentOwnerAction(id: string, formData: FormData): Promise<void> {
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '');
  const tenantSlug = await getActiveTenantSlug();
  if (!ownerMembershipId || !tenantSlug) return;
  await apiFetch(`/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ ownerMembershipId }),
  });
  revalidatePath('/documents');
}
