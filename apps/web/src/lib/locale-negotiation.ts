import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';

function qualityOf(part: string): number {
  const q = part
    .split(';')
    .slice(1)
    .map((value) => value.trim())
    .find((value) => value.startsWith('q='));
  const parsed = q ? Number(q.slice(2)) : 1;
  return Number.isFinite(parsed) ? parsed : 1;
}

/** Browser Accept-Language → supported product locale. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const candidates = (header ?? '')
    .split(',')
    .map((part, index) => {
      const raw = part.split(';')[0]?.trim().toLowerCase() ?? '';
      const primary = raw.split('-')[0] ?? raw;
      return { primary, q: qualityOf(part), index };
    })
    .filter((candidate) => localeSchema.safeParse(candidate.primary).success)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  return (candidates[0]?.primary as Locale | undefined) ?? DEFAULT_LOCALE;
}

/**
 * Экраны, которые по умолчанию всегда на английском (мандат Рашада 25.07.2026):
 * логин — витрина продукта и общая точка входа, язык там не должен зависеть от того,
 * что осталось в куке от прошлого пользователя или какой язык у браузера.
 * Явный выбор (`?locale=`, в т.ч. из переключателя языка) продолжает работать.
 */
const ENGLISH_BY_DEFAULT_PATHS = ['/login'];

export function isEnglishByDefaultPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ENGLISH_BY_DEFAULT_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * Explicit URL locale wins everywhere. On login the default is EN regardless of cookie
 * and browser language; elsewhere an explicit cookie wins, then browser language, then EN.
 */
export function resolveRequestLocale(input: {
  queryLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
  pathname?: string | null;
}): Locale {
  const query = localeSchema.safeParse(input.queryLocale);
  if (query.success) return query.data;
  if (isEnglishByDefaultPath(input.pathname)) return DEFAULT_LOCALE;
  const explicit = localeSchema.safeParse(input.cookieLocale);
  return explicit.success ? explicit.data : localeFromAcceptLanguage(input.acceptLanguage);
}
