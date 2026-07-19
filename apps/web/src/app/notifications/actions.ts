'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Отметить уведомление прочитанным (T-096). */
export async function markReadAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await apiFetch(`/notifications/${id}/read`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/notifications');
}

/** T-V19: сохранить настройки уведомлений тенанта (расписание/таймзона/email). */
export async function saveNotificationSettingsAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch('/notifications/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
    body: JSON.stringify({
      emailEnabled: formData.get('emailEnabled') === 'on',
      schedule: formData.get('schedule') === 'work_hours' ? 'work_hours' : 'anytime',
      timezone: String(formData.get('timezone') ?? 'UTC') || 'UTC',
    }),
  });
  revalidatePath('/notifications');
}
