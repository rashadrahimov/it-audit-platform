import type { NextRequest } from 'next/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

/**
 * Same-origin прокси выгрузки (REP-05): браузерная ссылка не несёт Bearer,
 * поэтому файл тянем серверно (cookie→Bearer в apiFetch) и отдаём как attachment.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response('unauthorized', { status: 401 });
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return new Response('no tenant', { status: 400 });

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get('entity') ?? 'findings';
  const format = searchParams.get('format') ?? 'csv';

  const res = await apiFetch(
    `/reports/export?entity=${encodeURIComponent(entity)}&format=${encodeURIComponent(format)}`,
    { headers: { 'X-Tenant-Slug': tenantSlug } },
  );
  if (!res.ok) return new Response('export failed', { status: res.status });

  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition':
        res.headers.get('content-disposition') ?? `attachment; filename="${entity}.${format}"`,
    },
  });
}
