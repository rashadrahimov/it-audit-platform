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

/** T-H49: назначить участника в команду аудита с engagement-role. */
export async function assignEngagementMemberAction(
  engagementId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const membershipId = String(formData.get('membershipId') ?? '');
  const engagementRole = String(formData.get('engagementRole') ?? '');
  if (!tenantSlug || !membershipId || !engagementRole) return;
  await apiFetch(`/engagements/${engagementId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ membershipId, engagementRole }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-H49: снять участника с команды аудита. */
export async function removeEngagementMemberAction(
  engagementId: string,
  memberId: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/engagements/${engagementId}/members/${memberId}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-V03: создать finding из детерминированного предложения (T-H15) одним кликом. */
export async function createFindingFromSuggestionAction(
  engagementId: string,
  checklistItemId: string,
  draftTitle: string,
  draftRisk: string,
  draftDescription: string,
  expected: string,
  observed: string,
  explainabilityReason: string,
  controlClause: string,
  riskJustification: string,
  draftRecommendation: string,
  confidence: number,
  evidenceReferencesJson: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const acceptedTitle = String(formData.get('title') ?? '').trim() || draftTitle;
  const acceptedDescription = String(formData.get('description') ?? '').trim() || draftDescription;
  const requestedRisk = String(formData.get('riskRating') ?? '').trim();
  const acceptedRisk = ['critical', 'high', 'medium', 'low'].includes(requestedRisk)
    ? requestedRisk
    : draftRisk;
  const acceptedRecommendation =
    String(formData.get('recommendation') ?? '').trim() || draftRecommendation;
  let evidenceReferences: Array<{
    documentId: string;
    filename: string;
    relation: string;
    location: string;
  }> = [];
  try {
    const parsed = JSON.parse(evidenceReferencesJson) as unknown;
    if (Array.isArray(parsed)) {
      evidenceReferences = parsed.filter(
        (ev): ev is (typeof evidenceReferences)[number] =>
          !!ev &&
          typeof ev === 'object' &&
          typeof (ev as { documentId?: unknown }).documentId === 'string' &&
          typeof (ev as { filename?: unknown }).filename === 'string' &&
          typeof (ev as { relation?: unknown }).relation === 'string' &&
          typeof (ev as { location?: unknown }).location === 'string',
      );
    }
  } catch {
    evidenceReferences = [];
  }
  await apiFetch('/findings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({
      engagementId,
      checklistItemId,
      titleI18n: { en: acceptedTitle },
      descriptionI18n: acceptedDescription ? { en: acceptedDescription } : undefined,
      riskRating: acceptedRisk,
      recommendationI18n: acceptedRecommendation ? { en: acceptedRecommendation } : undefined,
      aiReview: {
        source: 'finding_suggestion',
        decision: 'accepted',
        confidence,
        expected,
        observed,
        draftTitle,
        draftDescription,
        draftRiskRating: draftRisk,
        draftRecommendation,
        reason: explainabilityReason || draftDescription,
        controlClause,
        riskJustification,
        evidenceReferences,
      },
    }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

export async function rejectFindingSuggestionAction(
  engagementId: string,
  checklistItemId: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/engagements/${engagementId}/finding-suggestions/${checklistItemId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ reason: 'Rejected by auditor from HITL review queue' }),
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

/** T-H50: засеять чеклист аудита из reusable template его типа аудита. */
export async function seedChecklistFromAuditTypeAction(engagementId: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/audit-types/seed-checklist/${engagementId}`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-H51: ручной запрос доказательства из карточки аудита. */
export async function createEvidenceRequestAction(
  engagementId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const assigneeMembershipId = String(formData.get('assigneeMembershipId') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  if (!tenantSlug || !title) return;
  await apiFetch('/evidence-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({
      engagementId,
      title,
      description: description || undefined,
      assigneeMembershipId: assigneeMembershipId || undefined,
      dueDate: dueDate ? new Date(`${dueDate}T17:00:00.000Z`).toISOString() : undefined,
    }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-H51: human-reviewed AI-DRL подсказка → официальный запрос доказательства. */
export async function createEvidenceRequestFromSuggestionAction(
  engagementId: string,
  checklistItemId: string,
  title: string,
  description: string,
  reason: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug || !title.trim()) return;
  await apiFetch('/evidence-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({
      engagementId,
      title,
      description: [`AI-DRL:${checklistItemId}`, reason, description].filter(Boolean).join('\n\n'),
    }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-H51: принять предоставленное доказательство по запросу. */
export async function acceptEvidenceRequestAction(
  engagementId: string,
  requestId: string,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/evidence-requests/${requestId}/accept`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/engagements/${engagementId}`);
}

/** T-H52: приложить существующий документ к запросу доказательства. */
export async function provideEvidenceRequestAction(
  engagementId: string,
  requestId: string,
  formData: FormData,
): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const documentId = String(formData.get('documentId') ?? '').trim();
  if (!tenantSlug || !documentId) return;
  await apiFetch(`/evidence-requests/${requestId}/provide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({ documentId }),
  });
  revalidatePath(`/engagements/${engagementId}`);
}
