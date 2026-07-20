'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать контрактное обязательство из формы (T-077; T-V31 — опц. привязка к контракту). */
export async function createCommitmentAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const source = String(formData.get('source') ?? '').trim();
  const contractId = String(formData.get('contractId') ?? '').trim();
  await apiFetch('/commitments', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      ...(source ? { source } : {}),
      ...(contractId ? { contractId } : {}),
    }),
  });
  revalidatePath('/commitments');
}

/** T-V31: привязать обязательство к контракту (пусто — отвязать). */
export async function setCommitmentContractAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const raw = String(formData.get('contractId') ?? '').trim();
  await apiFetch(`/commitments/${id}/contract`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contractId: raw || null }),
  });
  revalidatePath('/commitments');
}

/** T-V31: создать контракт. */
export async function createContractAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const counterparty = String(formData.get('counterparty') ?? '').trim();
  const endDate = String(formData.get('endDate') ?? '').trim();
  await apiFetch('/contracts', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      ...(counterparty ? { counterparty } : {}),
      ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}),
    }),
  });
  revalidatePath('/commitments');
}

/** T-V43: правка обязательства — owner и срок. */
export async function setCommitmentDetailsAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  await apiFetch(`/commitments/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerMembershipId: ownerMembershipId || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    }),
  });
  revalidatePath('/commitments');
}

/** T-V31: удалить контракт. */
export async function deleteContractAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/contracts/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/commitments');
}

/** Сменить статус обязательства (met/at_risk/breached). */
export async function setCommitmentStatusAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !status) return;
  await apiFetch(`/commitments/${id}/status`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  revalidatePath('/commitments');
}
