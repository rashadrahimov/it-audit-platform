import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * Старт браузерного SSO (V49, T-H40): спрашиваем у API URL авторизации IdP тенанта
 * (mode=web) и уводим браузер прямо на IdP — internal API_URL наружу не светится.
 * Callback IdP → API завершит вход в веб-сессию (cookie) и вернёт на /account.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const email = req.nextUrl.searchParams.get('email') ?? '';
  const domain = req.nextUrl.searchParams.get('domain') ?? '';

  const qs = new URLSearchParams({ mode: 'web' });
  if (domain) qs.set('domain', domain);
  else if (email) qs.set('email', email);

  let location: string | null = null;
  try {
    const res = await fetch(`${API_URL}/auth/oidc/login?${qs.toString()}`, {
      redirect: 'manual',
      cache: 'no-store',
    });
    location = res.headers.get('location');
  } catch {
    location = null;
  }
  // не удалось получить URL IdP — назад на страницу SSO
  return NextResponse.redirect(location ?? new URL('/login/sso', req.url));
}
