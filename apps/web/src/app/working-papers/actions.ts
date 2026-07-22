'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

export async function createWorkingPaperAction(
  engagementId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const title = String(formData.get('title') ?? '').trim();
  if (!tenantSlug || !title) return;
  await apiFetch('/working-papers', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ engagementId, title, content: {} }),
  });
  revalidatePath('/working-papers');
}

export async function transitionWorkingPaperAction(id: string, to: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug || !['prepared', 'in_review', 'reviewed', 'signed_off'].includes(to)) return;
  await apiFetch(`/working-papers/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath(`/working-papers/${id}`);
  revalidatePath('/working-papers');
}

export async function updateWorkingPaperContentAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const raw = String(formData.get('content') ?? '').trim();
  let content: unknown = { text: raw };
  try {
    content = raw ? JSON.parse(raw) : {};
  } catch {
    // Plain text remains a structured content payload.
  }
  await apiFetch(`/working-papers/${id}/content`, {
    method: 'PUT',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  revalidatePath(`/working-papers/${id}`);
}

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
