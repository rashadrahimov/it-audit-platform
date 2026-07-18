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
