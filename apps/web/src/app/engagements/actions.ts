'use server';

import { redirect } from 'next/navigation';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

export interface NewEngagementState {
  error?: string;
}

const toIso = (d: string): string | undefined =>
  d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined;

/** T-117: создать engagement с нуля из формы → redirect на карточку. */
export async function createEngagementAction(
  _prev: NewEngagementState,
  formData: FormData,
): Promise<NewEngagementState> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return { error: 'no-tenant' };
  const subsidiaryId = String(formData.get('subsidiaryId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (!subsidiaryId || !title) return { error: 'empty' };
  const auditTypeCode = String(formData.get('auditTypeCode') ?? '');
  const mode = String(formData.get('mode') ?? 'formal');
  const periodStart = toIso(String(formData.get('periodStart') ?? ''));
  const periodEnd = toIso(String(formData.get('periodEnd') ?? ''));

  const res = await apiFetch('/engagements', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subsidiaryId,
      titleI18n: { en: title },
      mode: mode === 'light' ? 'light' : 'formal',
      ...(auditTypeCode ? { auditTypeCode } : {}),
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
      milestones: [],
    }),
  });
  if (!res.ok) return { error: 'failed' };
  const created = (await res.json()) as { id: string };
  redirect(`/engagements/${created.id}`);
}
