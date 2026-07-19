import { NextResponse } from 'next/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

/**
 * T-V01: проксирует скачивание документа (T-034 /documents/:id/content) браузеру —
 * cookie-сессия → Bearer+X-Tenant-Slug; обычная <a href> auth-header не отправит.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await getSessionUser())) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const { id } = await params;
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) {
    return NextResponse.json({ error: 'no tenant' }, { status: 400 });
  }
  const res = await apiFetch(`/documents/${id}/content`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: `api-${res.status}` }, { status: res.status });
  }
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('Content-Disposition') ?? 'attachment',
    },
  });
}
