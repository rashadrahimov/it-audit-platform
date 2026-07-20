'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V06: правка теста из карточки (title(en)/frequency/dueDate/owner). */
export async function updateTestAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  const frequency = String(formData.get('frequency') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '');
  const ownerMembershipId = String(formData.get('ownerMembershipId') ?? '');
  const body: Record<string, unknown> = {};
  if (title) body.titleI18n = { en: title };
  body.frequency = frequency || null;
  body.dueDate = dueDate ? new Date(dueDate).toISOString() : null;
  if (ownerMembershipId) body.ownerMembershipId = ownerMembershipId;
  await apiFetch(`/tests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify(body),
  });
  revalidatePath(`/tests/${id}`);
}

/** T-V06: деактивировать тест. */
export async function deactivateTestAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/tests/${id}/deactivate`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/tests/${id}`);
}

/** T-050: ручной автопрогон теста через коннектор. */
export async function runAutoTestAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/tests/${id}/run-auto`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/tests/${id}`);
}
