'use server';

import { revalidatePath } from 'next/cache';
import { setFlash } from '@/lib/flash';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

const CHECK_KEYS = ['diskEncryption', 'screenLock', 'antivirus', 'passwordPolicy'] as const;

function checks(formData: FormData): Record<(typeof CHECK_KEYS)[number], boolean> {
  return Object.fromEntries(CHECK_KEYS.map((key) => [key, formData.get(key) !== null])) as Record<
    (typeof CHECK_KEYS)[number],
    boolean
  >;
}

export async function createDeviceAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  const name = String(formData.get('name') ?? '').trim();
  const os = String(formData.get('os') ?? '').trim();
  const serial = String(formData.get('serial') ?? '').trim();
  if (!tenantSlug || !name) return;
  const res = await apiFetch('/devices', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      os: os || undefined,
      serial: serial || undefined,
      ...checks(formData),
    }),
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'created' : 'failed');
  revalidatePath('/devices');
}

export async function updateDeviceChecksAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const res = await apiFetch(`/devices/${id}/checks`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(checks(formData)),
  });
  await setFlash(res.ok ? 'success' : 'error', res.ok ? 'updated' : 'failed');
  revalidatePath('/devices');
}
