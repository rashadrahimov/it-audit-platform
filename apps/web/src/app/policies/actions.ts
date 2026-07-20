'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Workflow (T-052/T-V04): submit|archive из карточки. */
export async function submitPolicyAction(id: string, action: 'submit' | 'archive'): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/policies/${id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ action }),
  });
  revalidatePath(`/policies/${id}`);
}

/** Workflow (T-052/T-V04): approve|reject — сервер пускает только назначенного approver. */
export async function decisionPolicyAction(
  id: string,
  action: 'approve' | 'reject',
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/policies/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ action }),
  });
  revalidatePath(`/policies/${id}`);
}

/** T-V04: новая версия политики — документ из /documents + changelog. */
export async function addPolicyVersionAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const documentId = String(formData.get('documentId') ?? '');
  const changelog = String(formData.get('changelog') ?? '').trim();
  const body: Record<string, string> = {};
  if (documentId) body.documentId = documentId;
  if (changelog) body.changelog = changelog;
  await apiFetch(`/policies/${id}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify(body),
  });
  revalidatePath(`/policies/${id}`);
}

/** T-053/T-V04: запустить attestation-кампанию по выбранным членам. */
export async function campaignPolicyAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const membershipIds = formData.getAll('membershipId').map(String).filter(Boolean);
  if (membershipIds.length === 0) return;
  await apiFetch(`/policies/${id}/attestations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ membershipIds }),
  });
  revalidatePath(`/policies/${id}`);
}

/** T-053/T-V04: self-подтверждение ознакомления. */
export async function attestPolicyAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/policies/${id}/attest`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/policies/${id}`);
}

/** Создать политику из шаблона (T-V24): policy + md-документ + версия v1. */
export async function createPolicyFromTemplateAction(templateKey: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch('/policies/from-template', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateKey }),
  });
  revalidatePath('/policies');
}
