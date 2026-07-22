'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать риск (T-057): impact×likelihood → risk_class вычисляется на бэке. */
export async function createRiskAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const num = (k: string) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 1 && v <= 5 ? v : 3;
  };
  await apiFetch('/risks', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titleI18n: { en: title },
      inherentImpact: num('inherentImpact'),
      inherentLikelihood: num('inherentLikelihood'),
      residualImpact: num('residualImpact'),
      residualLikelihood: num('residualLikelihood'),
      treatment: String(formData.get('treatment') ?? 'mitigate'),
    }),
  });
  revalidatePath('/risks');
}

/** Пересчитать скоринг риска (T-V12): 4 оси → классы пересчитывает бэк. */
export async function rescoreRiskAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body: Record<string, number> = {};
  for (const k of [
    'inherentImpact',
    'inherentLikelihood',
    'residualImpact',
    'residualLikelihood',
  ]) {
    const v = Number(formData.get(k));
    if (Number.isFinite(v) && v >= 1 && v <= 10) body[k] = v;
  }
  if (Object.keys(body).length === 0) return;
  await apiFetch(`/risks/${id}/rescore`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath(`/risks/${id}`);
}

/** Редактировать карточку риска (T-V12): treatment/статус/owner/домен/категория. */
export async function updateRiskAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body: Record<string, unknown> = {};
  const treatment = String(formData.get('treatment') ?? '');
  if (['mitigate', 'transfer', 'accept', 'avoid'].includes(treatment)) body.treatment = treatment;
  const status = String(formData.get('status') ?? '');
  if (['open', 'in_progress', 'closed'].includes(status)) body.status = status;
  if (formData.has('ownerMembershipId')) {
    const owner = String(formData.get('ownerMembershipId') ?? '');
    body.ownerMembershipId = owner || null;
  }
  if (formData.has('approverMembershipId')) {
    const approver = String(formData.get('approverMembershipId') ?? '');
    body.approverMembershipId = approver || null;
  }
  if (formData.has('domain')) body.domain = String(formData.get('domain') ?? '').trim() || null;
  if (formData.has('category'))
    body.category = String(formData.get('category') ?? '').trim() || null;
  if (Object.keys(body).length === 0) return;
  await apiFetch(`/risks/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath(`/risks/${id}`);
  revalidatePath('/risks');
}

/** T-V57: отправить риск на согласование (approval_status → pending). */
export async function submitRiskApprovalAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/risks/${id}/submit-approval`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath(`/risks/${id}`);
  revalidatePath('/risks');
}

/** T-V57: решение согласующего по риску — approved|rejected. */
export async function decideRiskApprovalAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const decision = String(formData.get('decision') ?? '');
  if (!['approved', 'rejected'].includes(decision)) return;
  await apiFetch(`/risks/${id}/approve`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  revalidatePath(`/risks/${id}`);
  revalidatePath('/risks');
}

/** Привязать митигирующий контроль (T-058 → UI T-V12). */
export async function linkRiskControlAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const controlId = String(formData.get('controlId') ?? '');
  if (!controlId) return;
  await apiFetch(`/risks/${id}/controls`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ controlIds: [controlId] }),
  });
  revalidatePath(`/risks/${id}`);
}

/** Привязать узел audit universe (T-066 → UI T-V12). */
export async function linkRiskEntityAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const entityId = String(formData.get('entityId') ?? '');
  if (!entityId) return;
  await apiFetch(`/risks/${id}/entities`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityIds: [entityId] }),
  });
  revalidatePath(`/risks/${id}`);
}

/** Удалить риск (T-V12, soft delete) и вернуться в реестр. */
export async function deleteRiskAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/risks/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/risks');
  redirect('/risks');
}

/** «Add to register» (T-V23): сценарий из библиотеки → реестр тенанта. */
export async function addRiskFromLibraryAction(libraryRiskId: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/risks/library/${libraryRiskId}/add`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/risks');
}

/** Human-in-the-loop: принять AI/business-risk proposal и создать риск в реестре. */
export async function addRiskSuggestionAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const description = String(formData.get('description') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const domain = String(formData.get('domain') ?? '').trim();
  const sourceFindingId = String(formData.get('sourceFindingId') ?? '').trim();
  const confidence = Number(formData.get('confidence'));
  const affectedProcess = String(formData.get('affectedProcess') ?? '').trim();
  const affectedAsset = String(formData.get('affectedAsset') ?? '').trim();
  const affectedControlRef = String(formData.get('affectedControlRef') ?? '').trim();
  const evidenceType = String(formData.get('evidenceType') ?? '').trim();
  const evidenceId = String(formData.get('evidenceId') ?? '').trim();
  const evidenceLocation = String(formData.get('evidenceLocation') ?? '').trim();
  const dedupeFingerprint = String(formData.get('dedupeFingerprint') ?? '').trim();
  const num = (k: string) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 1 && v <= 5 ? v : 3;
  };
  await apiFetch('/risks', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titleI18n: { en: title, ru: title, az: title },
      descriptionI18n: description
        ? { en: description, ru: description, az: description }
        : undefined,
      category: category || undefined,
      domain: domain || undefined,
      inherentImpact: num('inherentImpact'),
      inherentLikelihood: num('inherentLikelihood'),
      residualImpact: num('inherentImpact'),
      residualLikelihood: num('inherentLikelihood'),
      treatment: 'mitigate',
      aiReview: sourceFindingId
        ? {
            source: 'risk_suggestion',
            decision: 'accepted',
            reviewStatus: 'accepted_by_human',
            sourceFindingId,
            confidence: Number.isFinite(confidence) ? confidence : undefined,
            affectedProcess: affectedProcess || undefined,
            affectedAsset: affectedAsset || undefined,
            affectedControlRef: affectedControlRef || null,
            evidenceRef:
              evidenceType && evidenceId && evidenceLocation
                ? { type: evidenceType, id: evidenceId, location: evidenceLocation }
                : undefined,
            dedupeFingerprint: dedupeFingerprint || undefined,
          }
        : undefined,
    }),
  });
  revalidatePath('/risks');
}

/** Настроить матрицу рисков (T-057 → UI T-V12): шкалы и пороги классов. */
export async function setRiskMatrixAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const int = (k: string, min: number, max: number, dflt: number) => {
    const v = Number(formData.get(k));
    return Number.isInteger(v) && v >= min && v <= max ? v : dflt;
  };
  const medium = int('medium', 1, 100, 6);
  const high = int('high', 1, 100, 12);
  const critical = int('critical', 1, 100, 20);
  if (!(medium < high && high < critical)) return; // пороги должны возрастать
  await apiFetch('/risks/matrix', {
    method: 'PUT',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      impactScale: int('impactScale', 3, 10, 5),
      likelihoodScale: int('likelihoodScale', 3, 10, 5),
      thresholds: { medium, high, critical },
    }),
  });
  revalidatePath('/risks');
}
