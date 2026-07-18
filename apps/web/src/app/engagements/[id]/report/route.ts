import { NextResponse } from 'next/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

const ALLOWED = new Set(['pdf', 'docx', 'xlsx', 'csv', 'xml']);

/**
 * Проксирует экспорт отчёта (T-045) браузеру: cookie-сессия → Bearer+X-Tenant-Slug
 * к API. Обычная <a href> в браузере auth-header не отправит — поэтому route-handler.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await getSessionUser())) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get('format') ?? 'pdf';
  const locale = url.searchParams.get('locale') ?? 'en';
  if (!ALLOWED.has(format)) {
    return NextResponse.json({ error: 'unsupported format' }, { status: 400 });
  }
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) {
    return NextResponse.json({ error: 'no tenant' }, { status: 400 });
  }

  const res = await apiFetch(`/engagements/${id}/report?format=${format}&locale=${locale}`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  if (!res.ok) {
    return NextResponse.json({ error: 'export failed' }, { status: res.status });
  }
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition':
        res.headers.get('content-disposition') ??
        `attachment; filename="engagement-report.${format}"`,
    },
  });
}
