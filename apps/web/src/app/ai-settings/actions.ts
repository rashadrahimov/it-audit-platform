'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

/** Тенант выбирает LLM-провайдера (EP-AI, T-H23). Пустой ключ → сохраняется существующий. */
export async function saveAiConfigAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const provider = String(formData.get('provider') ?? 'none');
  const baseUrl = String(formData.get('baseUrl') ?? '').trim();
  const model = String(formData.get('model') ?? '').trim();
  const apiKey = String(formData.get('apiKey') ?? '').trim();

  const memory = String(formData.get('memory') ?? '').trim();

  const body: Record<string, string> = { provider, memory };
  if (baseUrl) body.baseUrl = baseUrl;
  if (model) body.model = model;
  if (apiKey) body.apiKey = apiKey;

  await apiFetch('/ai/config', {
    method: 'PUT',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  revalidatePath('/ai-settings');
}
