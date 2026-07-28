import { NextResponse, type NextRequest } from 'next/server';

const SUPPORTED_LOCALES = new Set(['en', 'az', 'ru']);

/**
 * T-H110: URL locale override for demos, QA and client links.
 * `?locale=ru|az|en` wins for the current request and is persisted as the product locale cookie.
 */
export function proxy(request: NextRequest) {
  const queryLocale = request.nextUrl.searchParams.get('locale');
  const explicitLocale = queryLocale && SUPPORTED_LOCALES.has(queryLocale) ? queryLocale : null;
  const requestHeaders = new Headers(request.headers);
  // Путь нужен i18n-резолверу: на логине язык по умолчанию всегда английский
  requestHeaders.set('x-it-audit-pathname', request.nextUrl.pathname);

  if (explicitLocale) {
    requestHeaders.set('x-it-audit-query-locale', explicitLocale);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (explicitLocale) {
    response.cookies.set('locale', explicitLocale, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
