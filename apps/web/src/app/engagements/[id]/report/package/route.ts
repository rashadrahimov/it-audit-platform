import { NextResponse } from 'next/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

/**
 * Проксирует ZIP-пакет стандартных deliverables браузеру: cookie-сессия →
 * Bearer+X-Tenant-Slug к API. В пакете 5 документов × PDF/Word/Excel + manifest.
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
  const locale = url.searchParams.get('locale') ?? 'en';
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) {
    return NextResponse.json({ error: 'no tenant' }, { status: 400 });
  }

  const res = await apiFetch(
    `/engagements/${id}/report/package?locale=${encodeURIComponent(locale)}`,
    {
      headers: { 'X-Tenant-Slug': tenantSlug },
    },
  );
  if (!res.ok) {
    return NextResponse.json({ error: 'package export failed' }, { status: res.status });
  }
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/zip',
      'Content-Disposition':
        res.headers.get('content-disposition') ?? `attachment; filename="audit-package.zip"`,
    },
  });
}
