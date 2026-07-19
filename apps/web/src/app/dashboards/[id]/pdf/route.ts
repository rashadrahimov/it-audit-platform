import { NextResponse } from 'next/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

/** T-V15: проксирует PDF-экспорт дашборда браузеру (cookie-сессия → Bearer). */
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
  const res = await apiFetch(`/dashboards/${id}/export`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: `api-${res.status}` }, { status: res.status });
  }
  return new Response(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': res.headers.get('Content-Disposition') ?? 'attachment',
    },
  });
}
