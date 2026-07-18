'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Создать audit program с шагами (T-093). title/step → i18n (одинаково на все локали). */
export async function createProgramAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  const steps = [1, 2, 3]
    .map((i) => String(formData.get(`step${i}`) ?? '').trim())
    .filter(Boolean)
    .map((s, idx) => ({ titleI18n: { en: s, ru: s, az: s }, order: idx + 1 }));

  const engagementId = String(formData.get('engagementId') ?? '').trim();
  const subjectArea = String(formData.get('subjectArea') ?? '').trim();
  await apiFetch('/audit-programs', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titleI18n: { en: title, ru: title, az: title },
      engagementId: engagementId || undefined,
      subjectArea: subjectArea || undefined,
      steps: steps.length ? steps : undefined,
    }),
  });
  revalidatePath('/audit-programs');
}

/** Roll-forward программы в новый engagement (T-093). */
export async function rollForwardAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  const targetEngagementId = String(formData.get('targetEngagementId') ?? '');
  if (!id || !targetEngagementId) return;
  await apiFetch(`/audit-programs/${id}/roll-forward`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetEngagementId }),
  });
  revalidatePath('/audit-programs');
}
