'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

export interface InviteAuditorState {
  ok?: boolean;
  email?: string;
  error?: string;
}

/** T-115: пригласить внешнего аудитора (category=external_auditor + scope). */
export async function inviteAuditorAction(
  _prev: InviteAuditorState,
  formData: FormData,
): Promise<InviteAuditorState> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return { error: 'no-tenant' };
  const email = String(formData.get('email') ?? '').trim();
  const roleId = String(formData.get('roleId') ?? '');
  if (!email || !roleId) return { error: 'empty' };
  const subsidiaryScope = formData.getAll('subsidiaryScope').map(String).filter(Boolean);
  const locale = await getCurrentLocale();

  const res = await apiFetch('/invites', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      roleId,
      category: 'external_auditor',
      isAuditSeat: true,
      locale,
      // пустой выбор = вся группа (null)
      subsidiaryScope: subsidiaryScope.length > 0 ? subsidiaryScope : null,
    }),
  });
  if (!res.ok) return { error: 'failed' };
  revalidatePath('/auditors');
  return { ok: true, email };
}

/** T-110/T-115: задать окно доступа участнику (пустые поля = снять границу). */
export async function setAccessWindowAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const from = String(formData.get('dataAccessFrom') ?? '').trim();
  const until = String(formData.get('dataAccessUntil') ?? '').trim();
  await apiFetch(`/memberships/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // <input type=date> даёт YYYY-MM-DD → нормализуем в ISO; пусто = null (снять)
      dataAccessFrom: from ? new Date(`${from}T00:00:00Z`).toISOString() : null,
      dataAccessUntil: until ? new Date(`${until}T23:59:59Z`).toISOString() : null,
    }),
  });
  revalidatePath('/auditors');
}

/** T-109/T-115: отозвать доступ участника (soft — status=revoked). */
export async function revokeMembershipAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/memberships/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/auditors');
}
