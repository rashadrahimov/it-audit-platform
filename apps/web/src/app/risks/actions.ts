'use server';

import { revalidatePath } from 'next/cache';
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
