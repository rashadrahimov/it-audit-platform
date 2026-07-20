'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** T-V49: сохранить per-tenant SSO-конфиг. Пустой секрет → сохраняется существующий. */
export async function saveSsoConfigAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const body: Record<string, string | boolean> = {
    enabled: formData.get('enabled') === 'on',
    protocol: String(formData.get('protocol') ?? 'oidc'),
    emailDomain: String(formData.get('emailDomain') ?? '').trim(),
    entryPoint: String(formData.get('entryPoint') ?? '').trim(),
    clientId: String(formData.get('clientId') ?? '').trim(),
  };
  const secret = String(formData.get('clientSecret') ?? '').trim();
  if (secret) body.clientSecret = secret;

  await apiFetch('/sso-config', {
    method: 'PUT',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath('/sso-settings');
}
