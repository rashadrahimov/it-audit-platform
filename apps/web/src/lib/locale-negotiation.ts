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

/** Explicit cookie wins; first visit falls back to browser language before EN. */
export function resolveRequestLocale(input: {
  queryLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  const query = localeSchema.safeParse(input.queryLocale);
  if (query.success) return query.data;
  const explicit = localeSchema.safeParse(input.cookieLocale);
  return explicit.success ? explicit.data : localeFromAcceptLanguage(input.acceptLanguage);
}
