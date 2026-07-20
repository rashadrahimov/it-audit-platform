'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Собрать config из полей формы с префиксом cfg_ (пустые строки пропускаем). */
function collectConfig(formData: FormData): Record<string, string> {
  const config: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('cfg_') && typeof value === 'string') {
      const v = value.trim();
      if (v !== '') config[key.slice(4)] = v;
    }
  }
  return config;
}

/** Ручной sync коннектора из UI (T-049/T-050). */
export async function syncConnectorAction(connectorId: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/connectors/${connectorId}/sync`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/connectors');
}

/** T-V38: создать коннектор из каталога — провайдер + capabilities + config по полям каталога. */
export async function createConnectorAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const provider = String(formData.get('provider') ?? '').trim();
  if (!provider) return;
  const capabilities = formData.getAll('capabilities').map(String).filter(Boolean);
  if (capabilities.length === 0) return;
  await apiFetch('/connectors', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, capabilities, config: collectConfig(formData) }),
  });
  revalidatePath('/connectors');
}

/** T-V38: обновить коннектор — статус/расписание/capabilities/config (частично). */
export async function updateConnectorAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  const body: Record<string, unknown> = {};

  const status = String(formData.get('status') ?? '').trim();
  if (status === 'active' || status === 'disabled') body.status = status;

  const rawInterval = formData.get('syncIntervalMinutes');
  if (rawInterval !== null) {
    const n = Number(rawInterval);
    body.syncIntervalMinutes = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const capabilities = formData.getAll('capabilities').map(String).filter(Boolean);
  if (capabilities.length > 0) body.capabilities = capabilities;

  const config = collectConfig(formData);
  if (Object.keys(config).length > 0) body.config = config;

  await apiFetch(`/connectors/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath('/connectors');
}

/** T-V38: тест соединения — возвращает {ok, message} для inline-фидбека (useActionState). */
export async function testConnectorAction(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return { ok: false, message: 'no tenant' };
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, message: 'no id' };
  const res = await apiFetch(`/connectors/${id}/test`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
  return (await res.json()) as { ok: boolean; message: string };
}

/** T-V38: удалить коннектор (soft-delete). */
export async function deleteConnectorAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await apiFetch(`/connectors/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/connectors');
}
