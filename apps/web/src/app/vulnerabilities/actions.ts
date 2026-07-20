'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V32: создать уязвимость (severity → авто-дедлайн по SLA-окну; опц. привязка к активу). */
export async function createVulnAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  const severity = String(formData.get('severity') ?? 'medium');
  const cve = String(formData.get('cve') ?? '').trim();
  const assetId = String(formData.get('assetId') ?? '').trim();
  await apiFetch('/vulnerabilities', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      severity,
      ...(cve ? { cve } : {}),
      ...(assetId ? { assetId } : {}),
    }),
  });
  revalidatePath('/vulnerabilities');
}

/** Переход уязвимости: open→remediating→resolved (T-062). */
export async function transitionVulnAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!id || !to) return;
  await apiFetch(`/vulnerabilities/${id}/transition`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  revalidatePath('/vulnerabilities');
}
