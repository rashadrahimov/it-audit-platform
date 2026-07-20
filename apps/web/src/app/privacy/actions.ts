'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать операцию обработки ПДн (ROPA, T-074, T-V41 — со связями). */
export async function createRopaAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const purpose = String(formData.get('purpose') ?? '').trim();
  const retentionPeriod = String(formData.get('retentionPeriod') ?? '').trim();
  const vendorId = String(formData.get('vendorId') ?? '').trim();
  const reviewDate = String(formData.get('reviewDate') ?? '').trim();
  const locationsRaw = String(formData.get('dataLocations') ?? '').trim();
  const dataLocations = locationsRaw
    ? locationsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  await apiFetch('/processing-activities', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nameI18n: { en: name },
      legalBasis: String(formData.get('legalBasis') ?? 'consent'),
      role: String(formData.get('role') ?? 'controller'),
      crossBorder: formData.get('crossBorder') === 'on',
      ...(purpose ? { purpose } : {}),
      ...(retentionPeriod ? { retentionPeriod } : {}),
      ...(vendorId ? { vendorId } : {}),
      ...(reviewDate ? { reviewDate: new Date(reviewDate).toISOString() } : {}),
      ...(dataLocations.length ? { dataLocations } : {}),
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
  const approverMembershipId = String(formData.get('approverMembershipId') ?? '').trim();
  await apiFetch('/processing-activities/dpia', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      processingActivityId,
      title,
      riskLevel: String(formData.get('riskLevel') ?? 'medium'),
      ...(approverMembershipId ? { approverMembershipId } : {}),
    }),
  });
  revalidatePath('/privacy');
}

/** Workflow DPIA: draft→in_progress→pending_approval→completed. */
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

/** T-V41: approver утверждает DPIA. */
export async function approveDpiaAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/processing-activities/dpia/${id}/approve`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/privacy');
}
