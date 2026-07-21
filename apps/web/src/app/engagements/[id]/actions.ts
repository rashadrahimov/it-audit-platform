'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Восстановить/дублировать аудит (T-H16): создаёт копию, переходит на неё. */
export async function duplicateEngagementAction(engagementId: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const res = await apiFetch(`/engagements/${engagementId}/duplicate`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (res.ok) {
    const created = (await res.json()) as { id: string };
    redirect(`/engagements/${created.id}`);
  }
  revalidatePath(`/engagements/${engagementId}`);
}

/** Чеклист (T-036): добавить выбранные контроли снапшотами. */
export async function addChecklistItemsAction(
  engagementId: string,
  formData: FormData,
): Promise<void> {
  const controlIds = formData.getAll('controlId').map(String).filter(Boolean);
  const tenantSlug = await getActiveTenantSlug();
  if (controlIds.length === 0 || !tenantSlug) return;
  await apiFetch(`/engagements/${engagementId}/checklist-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ controlIds }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** Ответ респондента (T-037): upsert текста и compliance-статуса пункта. */
export async function saveResponseAction(engagementId: string, formData: FormData): Promise<void> {
  const itemId = String(formData.get('itemId') ?? '');
  const text = String(formData.get('text') ?? '').trim();
  const complianceStatus = String(formData.get('complianceStatus') ?? '');
  const tenantSlug = await getActiveTenantSlug();
  if (!itemId || !text || !complianceStatus || !tenantSlug) return;
  await apiFetch(`/engagements/${engagementId}/checklist-items/${itemId}/response`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ text, complianceStatus }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** Переход state machine из UI (T-035); ошибки перехода видны при обновлении страницы. */
export async function transitionAction(engagementId: string, to: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/engagements/${engagementId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ to }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-V03: создать finding из детерминированного предложения (T-H15) одним кликом. */
export async function createFindingFromSuggestionAction(
  engagementId: string,
  checklistItemId: string,
  suggestedTitle: string,
  suggestedRisk: string,
  reason: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch('/findings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({
      engagementId,
      checklistItemId,
      titleI18n: { en: suggestedTitle },
      descriptionI18n: reason ? { en: reason } : undefined,
      riskRating: suggestedRisk,
    }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-H35: recommendations findings → live Action Plan tasks. */
export async function seedActionPlanFromRecommendationsAction(engagementId: string): Promise<void> {
  const [tenantSlug, locale] = await Promise.all([getActiveTenantSlug(), getLocale()]);
  if (!tenantSlug) return;
  await apiFetch('/tasks/action-plan/from-findings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ engagementId, locale }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}
