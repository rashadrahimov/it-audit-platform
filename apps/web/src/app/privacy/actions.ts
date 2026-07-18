'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать операцию обработки ПДн (ROPA, T-074). */
export async function createRopaAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  await apiFetch('/processing-activities', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nameI18n: { en: name },
      legalBasis: String(formData.get('legalBasis') ?? 'consent'),
      role: String(formData.get('role') ?? 'controller'),
    }),
  });
  revalidatePath('/privacy');
}

/** Архивировать операцию обработки. */
export async function archiveRopaAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/processing-activities/${id}/archive`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/privacy');
}

/** Создать DPIA для операции обработки (T-075). */
export async function createDpiaAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const processingActivityId = String(formData.get('processingActivityId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (!processingActivityId || !title) return;
  await apiFetch('/processing-activities/dpia', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      processingActivityId,
      title,
      riskLevel: String(formData.get('riskLevel') ?? 'medium'),
    }),
  });
  revalidatePath('/privacy');
}

/** Workflow DPIA: draft→in_progress→completed. */
export async function transitionDpiaAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await apiFetch(`/processing-activities/dpia/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/privacy');
}
