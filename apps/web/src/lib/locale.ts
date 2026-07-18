import { getLocale } from 'next-intl/server';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';

/** Локаль запроса, сужённая до типа продукта (next-intl отдаёт string). */
export async function getCurrentLocale(): Promise<Locale> {
  const parsed = localeSchema.safeParse(await getLocale());
  return parsed.success ? parsed.data : DEFAULT_LOCALE;
}
