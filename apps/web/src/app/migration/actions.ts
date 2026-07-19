'use server';

import { apiFetch, getActiveTenantSlug } from '@/lib/session';

interface ParsedRow {
  ref: string;
  domain: string | null;
  complianceStatus: string | null;
  riskRating: string | null;
}
export interface MigrationState {
  mode?: 'preview' | 'import';
  count?: number;
  rows?: ParsedRow[];
  imported?: { domains: number; controls: number; skipped: number };
  error?: string;
}

/** Загрузка чеклист-шаблона: preview (dry-run) или import — по кнопке (T-H18, EP-MIGRATE). */
export async function processChecklistAction(
  _prev: MigrationState,
  formData: FormData,
): Promise<MigrationState> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return { error: 'no-tenant' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'no-file' };
  const mode = formData.get('mode') === 'import' ? 'import' : 'preview';

  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`/migration/checklist/${mode === 'import' ? 'import' : 'preview'}`, {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug },
    body: fd,
  });
  if (!res.ok) return { error: `api-${res.status}` };
  const data = await res.json();
  return mode === 'import'
    ? { mode, imported: data }
    : { mode, count: data.count, rows: data.rows };
}
