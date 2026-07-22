'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function payload(formData: FormData) {
  const term = value(formData, 'term');
  const en = value(formData, 'definitionEn');
  const ru = value(formData, 'definitionRu');
  const az = value(formData, 'definitionAz');
  return {
    term,
    definitionI18n: { en, ru: ru || en, az: az || en },
    category: value(formData, 'category') || undefined,
  };
}

export async function createGlossaryTermAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const body = payload(formData);
  if (!tenantSlug || !body.term || !body.definitionI18n.en) return;
  await apiFetch('/glossary', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath('/glossary');
}

export async function updateGlossaryTermAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const body = payload(formData);
  if (!tenantSlug || !body.term || !body.definitionI18n.en) return;
  await apiFetch(`/glossary/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath('/glossary');
}

export async function deleteGlossaryTermAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/glossary/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/glossary');
}
