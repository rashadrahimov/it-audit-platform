'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Назначить owner/статус/заметку контроля (T-V45); global → адаптация на бэке. */
export async function updateControlAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body: Record<string, unknown> = {};
  if (formData.has('ownerMembershipId')) {
    const owner = String(formData.get('ownerMembershipId') ?? '');
    body.ownerMembershipId = owner || null;
  }
  const status = String(formData.get('status') ?? '');
  if (['active', 'inactive', 'retired'].includes(status)) body.status = status;
  if (formData.has('note')) body.note = String(formData.get('note') ?? '').trim() || null;
  if (Object.keys(body).length === 0) return;
  await apiFetch(`/controls/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath(`/controls/${id}`);
  revalidatePath('/controls');
}
