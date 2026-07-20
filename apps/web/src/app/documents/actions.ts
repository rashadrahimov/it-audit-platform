'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V01/T-V02: загрузка документа-доказательства из UI (+привязка «type:id», категория, draft). */
export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const file = formData.get('file');
  if (!tenantSlug || !(file instanceof File) || file.size === 0) return;

  const fd = new FormData();
  fd.append('file', file);
  const renewBy = String(formData.get('renewBy') ?? '');
  if (renewBy) fd.append('renewBy', new Date(renewBy).toISOString());
  const category = String(formData.get('category') ?? '').trim();
  if (category) fd.append('category', category);
  if (formData.get('status') === 'draft') fd.append('status', 'draft');
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

/** T-V02: запросить доказательство — needs_document-плейсхолдер без файла. */
export async function requestDocumentAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const filename = String(formData.get('filename') ?? '').trim();
  if (!filename) return;
  const category = String(formData.get('category') ?? '').trim();
  const renewBy = String(formData.get('renewBy') ?? '');
  await apiFetch('/documents/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({
      filename,
      ...(category ? { category } : {}),
      ...(renewBy ? { renewBy: new Date(renewBy).toISOString() } : {}),
    }),
  });
  revalidatePath('/documents');
}

/** T-V02: опубликовать черновик (draft → active). */
export async function publishDocumentAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/documents/${id}/publish`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/documents');
}

/** T-V02: загрузить файл в плейсхолдер / новую версию документа. */
export async function fulfillDocumentAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const file = formData.get('file');
  if (!tenantSlug || !(file instanceof File) || file.size === 0) return;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('supersedesId', id);
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
