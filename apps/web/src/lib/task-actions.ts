'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V27: создать задачу ремедиации на полиморфной сущности. */
export async function createTaskAction(
  entityType: string,
  entityId: string,
  path: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const assignee = String(formData.get('assigneeMembershipId') ?? '');
  const due = String(formData.get('dueDate') ?? '');
  await apiFetch('/tasks', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityType,
      entityId,
      title,
      ...(assignee ? { assigneeMembershipId: assignee } : {}),
      ...(due ? { dueDate: new Date(due).toISOString() } : {}),
    }),
  });
  revalidatePath(path);
}

/** T-V27: продвинуть статус задачи (open→in_progress→done). */
export async function updateTaskStatusAction(
  id: string,
  status: string,
  path: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  revalidatePath(path);
}

/** T-V27: удалить задачу. */
export async function deleteTaskAction(id: string, path: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/tasks/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(path);
}
