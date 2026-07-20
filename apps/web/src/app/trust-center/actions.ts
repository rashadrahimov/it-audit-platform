'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V30: одобрить/отклонить запрос доступа (approve → выдаётся токен-ссылка). */
export async function decideTrustAccessAction(
  id: string,
  to: 'approved' | 'denied',
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/trust-center/access-requests/${id}/decision`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/trust-center');
}
