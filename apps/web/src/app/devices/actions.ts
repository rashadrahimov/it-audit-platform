'use server';

import { revalidatePath } from 'next/cache';
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
  await apiFetch('/devices', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      os: os || undefined,
      serial: serial || undefined,
      ...checks(formData),
    }),
  });
  revalidatePath('/devices');
}

export async function updateDeviceChecksAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/devices/${id}/checks`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(checks(formData)),
  });
  revalidatePath('/devices');
}
