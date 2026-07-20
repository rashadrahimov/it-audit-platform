import { NextResponse } from 'next/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

interface AssetRow {
  name: string;
  type: string;
  owner: string | null;
  fromConnector: boolean;
  provider: string | null;
  tags: Array<{ name: string }>;
}

const csvCell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** T-V11: экспорт инвентаря активов в CSV (авторизация через cookie-сессию). */
export async function GET(request: Request): Promise<Response> {
  if (!(await getSessionUser())) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) {
    return NextResponse.json({ error: 'no tenant' }, { status: 400 });
  }
  const res = await apiFetch('/assets', { headers: { 'X-Tenant-Slug': tenantSlug } });
  if (!res.ok) {
    return NextResponse.json({ error: `api-${res.status}` }, { status: res.status });
  }
  const assets: AssetRow[] = await res.json();
  const lines = [
    'name;type;owner;source;tags',
    ...assets.map((a) =>
      [
        csvCell(a.name),
        csvCell(a.type),
        csvCell(a.owner ?? ''),
        csvCell(a.fromConnector ? (a.provider ?? 'connector') : 'manual'),
        csvCell(a.tags.map((t) => t.name).join(', ')),
      ].join(';'),
    ),
  ];
  // BOM — чтобы Excel корректно открыл UTF-8 (кириллица в именах)
  return new Response('\ufeff' + lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="asset-inventory.csv"',
    },
  });
}
