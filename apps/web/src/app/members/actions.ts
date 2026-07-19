'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V05: смена роли участника (LOG-05 на сервере). */
export async function changeMemberRoleAction(
  membershipId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const roleId = String(formData.get('roleId') ?? '');
  if (!tenantSlug || !roleId) return;
  await apiFetch(`/memberships/${membershipId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ roleId }),
  });
  revalidatePath('/members');
}
