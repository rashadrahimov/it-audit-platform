'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V46: выпустить новую версию фреймворка (копия + перенос маппингов). */
export async function newFrameworkVersionAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const version = String(formData.get('version') ?? '').trim();
  if (!version) return;
  const notes = String(formData.get('notes') ?? '').trim();
  const res = await apiFetch(`/frameworks/${id}/new-version`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, ...(notes ? { notes } : {}) }),
  });
  revalidatePath('/frameworks');
  if (res.ok) {
    const { id: newId } = await res.json();
    redirect(`/frameworks/${newId}`);
  }
}

/** Активировать фреймворк из каталога (T-V25, «Add framework»). */
export async function activateFrameworkAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/frameworks/${id}/activate`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/frameworks');
  revalidatePath(`/frameworks/${id}`);
}

/** Деактивировать фреймворк (вернуть в Available, T-V25). */
export async function deactivateFrameworkAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/frameworks/${id}/activate`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/frameworks');
  revalidatePath(`/frameworks/${id}`);
}
