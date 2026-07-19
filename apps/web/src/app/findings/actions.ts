'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Lifecycle (T-039/T-V03): перевести finding в следующий статус. */
export async function transitionFindingAction(id: string, to: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/findings/${id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ to }),
  });
  revalidatePath(`/findings/${id}`);
}

/** Re-test аудитором (T-039): passed → closed, failed → in_progress. */
export async function retestFindingAction(id: string, result: 'passed' | 'failed'): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/findings/${id}/retest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ result }),
  });
  revalidatePath(`/findings/${id}`);
}

/** Назначить владельца (T-039): статус assigned + письмо owner'у. */
export async function assignFindingAction(id: string, formData: FormData): Promise<void> {
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '');
  const tenantSlug = await getActiveTenantSlug();
  if (!ownerMembershipId || !tenantSlug) return;
  await apiFetch(`/findings/${id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ ownerMembershipId }),
  });
  revalidatePath(`/findings/${id}`);
}

/** Комментарий к finding (T-023 полиморфные comments; T-V03 форма). */
export async function addFindingCommentAction(id: string, formData: FormData): Promise<void> {
  const body = String(formData.get('body') ?? '').trim();
  const tenantSlug = await getActiveTenantSlug();
  if (!body || !tenantSlug) return;
  await apiFetch('/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ entityType: 'finding', entityId: id, body }),
  });
  revalidatePath(`/findings/${id}`);
}
