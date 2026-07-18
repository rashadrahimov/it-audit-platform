import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, localeSchema } from '@it-audit/shared';

/**
 * i18n-каркас UI (T-022, ADR-0009): локаль — из cookie `locale` (без префикса в URL);
 * невалидная/отсутствующая → EN. Выбор сохраняется LocaleSwitcher'ом.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const parsed = localeSchema.safeParse(store.get('locale')?.value);
  const locale = parsed.success ? parsed.data : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
