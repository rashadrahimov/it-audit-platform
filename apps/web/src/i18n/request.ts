import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { resolveRequestLocale } from '@/lib/locale-negotiation';

/**
 * i18n-каркас UI (T-022, ADR-0009): локаль — из cookie `locale` (без префикса в URL);
 * невалидная/отсутствующая → язык браузера из Accept-Language, затем EN.
 * Выбор сохраняется LocaleSwitcher'ом и всегда сильнее браузерного языка.
 */
export default getRequestConfig(async () => {
  const [store, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveRequestLocale({
    cookieLocale: store.get('locale')?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
