'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

function num(v: FormDataEntryValue | null): number | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Создать KPI контроля (T-106). */
export async function createKpiAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const controlId = String(formData.get('controlId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!controlId || !name) return;
  const unit = String(formData.get('unit') ?? '').trim();
  await apiFetch('/control-kpis', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      controlId,
      name,
      unit: unit || undefined,
      targetValue: num(formData.get('targetValue')),
      currentValue: num(formData.get('currentValue')),
      direction: String(formData.get('direction') ?? 'higher_better'),
    }),
  });
  revalidatePath('/kpi');
}

/** Замер текущего значения KPI → пересчёт on-track (T-106). */
export async function measureKpiAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const currentValue = num(formData.get('currentValue'));
  if (!id || currentValue === undefined) return;
  await apiFetch(`/control-kpis/${id}/value`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentValue }),
  });
  revalidatePath('/kpi');
}
