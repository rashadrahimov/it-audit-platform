'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

const TYPES = ['erp', 'db', 'network', 'app', 'cloud', 'endpoint', 'other'];

/** Создать ИТ-актив вручную (T-066 → UI T-V11): проекция в universe на бэке. */
export async function createAssetAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  const type = String(formData.get('type') ?? 'other');
  const owner = String(formData.get('ownerMembershipId') ?? '');
  await apiFetch('/assets', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      type: TYPES.includes(type) ? type : 'other',
      ...(owner ? { ownerMembershipId: owner } : {}),
    }),
  });
  revalidatePath('/assets');
}

/** Bulk-тег выбранных активов (T-V11): чекбоксы assetId + имя тега. */
export async function bulkTagAssetsAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const assetIds = formData.getAll('assetId').map(String).filter(Boolean);
  const tagName = String(formData.get('tagName') ?? '').trim();
  if (assetIds.length === 0 || !tagName) return;
  await apiFetch('/assets/bulk-tag', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetIds, tagName }),
  });
  revalidatePath('/assets');
}
