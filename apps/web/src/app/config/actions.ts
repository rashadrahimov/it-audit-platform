'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать тег (T-076). */
export async function createTagAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const color = String(formData.get('color') ?? '').trim();
  await apiFetch('/tags', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color: color || undefined }),
  });
  revalidatePath('/config');
}

/** T-V36a: сохранить бизнес-профиль тенанта (юр.имя/юрисдикция/адрес/контакт). */
export async function saveBusinessProfileAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body: Record<string, string | number> = {};
  for (const key of ['legalName', 'jurisdiction', 'address', 'incidentContact'] as const) {
    body[key] = String(formData.get(key) ?? '').trim();
  }
  const idle = Number(formData.get('idleTimeoutMin'));
  if (Number.isFinite(idle)) body.idleTimeoutMin = Math.min(1440, Math.max(0, Math.round(idle)));
  const dl = String(formData.get('defaultLocale') ?? '').trim();
  if (dl === 'en' || dl === 'az' || dl === 'ru') body.defaultLocale = dl;
  await apiFetch('/business-profile', {
    method: 'PUT',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath('/config');
}

/** T-V32: сохранить SLA-окна ремедиации тенанта по severity (+ окно due_soon). */
export async function saveSlaConfigAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body: Record<string, number> = {};
  for (const key of ['critical', 'high', 'medium', 'low', 'dueSoonDays'] as const) {
    const n = Number(formData.get(key));
    if (Number.isFinite(n) && n > 0) body[key] = Math.round(n);
  }
  await apiFetch('/sla-config', {
    method: 'PUT',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath('/config');
}

/** Завести кастомный тип аудита (T-084). nameI18n — одинаковое имя на все локали. */
export async function createAuditTypeAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const code = String(formData.get('code') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const name = String(formData.get('name') ?? '').trim();
  if (!code || !name) return;
  await apiFetch('/audit-types', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, nameI18n: { en: name, ru: name, az: name } }),
  });
  revalidatePath('/config');
}
