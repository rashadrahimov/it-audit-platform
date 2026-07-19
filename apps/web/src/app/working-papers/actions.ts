'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Аннотация WP (T-H19 → UI T-V14): comment/tick_mark/exception + anchor. */
export async function createAnnotationAction(
  workingPaperId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return;
  const kind = String(formData.get('kind') ?? 'comment');
  const anchor = String(formData.get('anchor') ?? '').trim();
  await apiFetch('/annotations', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workingPaperId,
      kind: ['comment', 'tick_mark', 'exception'].includes(kind) ? kind : 'comment',
      body,
      ...(anchor ? { anchor } : {}),
    }),
  });
  revalidatePath('/working-papers');
}

/** Отметить аннотацию решённой (T-V14). */
export async function resolveAnnotationAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/annotations/${id}/resolve`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/working-papers');
}

/** Удалить аннотацию (T-V14). */
export async function deleteAnnotationAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/annotations/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/working-papers');
}
