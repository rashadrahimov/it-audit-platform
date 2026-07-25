'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

async function post(path: string, body: unknown, method = 'POST'): Promise<Response | null> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return null;
  return apiFetch(path, {
    method,
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * T-IR06: зафиксировать инцидент — сразу в фазе detected, и сразу открыть его карточку.
 * (Редирект вернулся в T-IR09: он не доезжал из-за глобальной Suspense-границы `app/loading.tsx`,
 * ронявшей коммит обновления в Next 15.5.x.)
 */
export async function createIncidentAction(formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const category = String(formData.get('category') ?? '').trim();
  const res = await post('/incidents', {
    title,
    severity: String(formData.get('severity') ?? 'medium'),
    category: category || undefined,
    description: String(formData.get('description') ?? '').trim() || undefined,
  });
  revalidatePath('/incidents');
  if (!res?.ok) return;
  const created = (await res.json()) as { id: string };
  redirect(`/incidents/${created.id}`);
}

/** Переход фазы реагирования (+ заметка в таймлайн). */
export async function transitionIncidentAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await post(`/incidents/${id}/transition`, {
    to,
    note: String(formData.get('note') ?? '').trim() || undefined,
  });
  revalidatePath(`/incidents/${id}`);
  revalidatePath('/incidents');
}

/** Ручная запись в таймлайн: заметка или предпринятое действие. */
export async function addIncidentEventAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!id || !note) return;
  await post(`/incidents/${id}/events`, { kind: String(formData.get('kind') ?? 'note'), note });
  revalidatePath(`/incidents/${id}`);
}

/** Назначить incident commander (уведомление уходит назначенному). */
export async function assignIncidentAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const commanderMembershipId = String(formData.get('commanderMembershipId') ?? '');
  if (!id || !commanderMembershipId) return;
  await post(`/incidents/${id}/assign`, { commanderMembershipId });
  revalidatePath(`/incidents/${id}`);
}

/** Связать инцидент с сущностью платформы. */
export async function linkIncidentAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '').trim();
  if (!id || !entityType || !entityId) return;
  await post(`/incidents/${id}/links`, { entityType, entityId });
  revalidatePath(`/incidents/${id}`);
}

export async function unlinkIncidentAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const linkId = String(formData.get('linkId') ?? '');
  if (!id || !linkId) return;
  await post(`/incidents/${id}/links/${linkId}`, {}, 'DELETE');
  revalidatePath(`/incidents/${id}`);
}

/** Постмортем: причины, влияние, уроки (доступен с фазы recovered). */
export async function savePostmortemAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await post(`/incidents/${id}/postmortem`, {
    rootCause: String(formData.get('rootCause') ?? '').trim() || undefined,
    impactSummary: String(formData.get('impactSummary') ?? '').trim() || undefined,
    lessonsLearned: String(formData.get('lessonsLearned') ?? '').trim() || undefined,
  });
  revalidatePath(`/incidents/${id}`);
}

/** Пометить инцидент подлежащим уведомлению регулятора (считает срок от обнаружения). */
export async function setReportableAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await post(
    `/incidents/${id}`,
    {
      reportable: formData.get('reportable') !== null,
      regulator: String(formData.get('regulator') ?? '').trim() || null,
    },
    'PATCH',
  );
  revalidatePath(`/incidents/${id}`);
  revalidatePath('/incidents');
}

/** Отметка «регулятор уведомлён». */
export async function notifyRegulatorAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await post(`/incidents/${id}/notify`, {
    note: String(formData.get('note') ?? '').trim() || undefined,
  });
  revalidatePath(`/incidents/${id}`);
  revalidatePath('/incidents');
}
