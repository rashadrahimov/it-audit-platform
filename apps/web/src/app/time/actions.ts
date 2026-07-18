'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Тайм-запись (T-088). date из input[type=date] → ISO datetime. */
export async function createTimeEntryAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const dateRaw = String(formData.get('date') ?? '').trim();
  const hours = Number(formData.get('hours'));
  if (!dateRaw || !Number.isFinite(hours) || hours <= 0) return;

  const engagementId = String(formData.get('engagementId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  await apiFetch('/time-entries', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: new Date(dateRaw).toISOString(),
      hours,
      phase: String(formData.get('phase') ?? 'fieldwork'),
      category: String(formData.get('category') ?? 'audit'),
      engagementId: engagementId || undefined,
      note: note || undefined,
    }),
  });
  revalidatePath('/time');
}
