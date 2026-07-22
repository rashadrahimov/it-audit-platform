import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { resolveRequestLocale } from '@/lib/locale-negotiation';

/**
 * i18n-каркас UI (T-022, ADR-0009): явный `?locale=ru|az|en` сильнее cookie,
 * cookie `locale` сильнее браузера; невалидная/отсутствующая → Accept-Language, затем EN.
 * LocaleSwitcher сохраняет cookie и оставляет locale в URL, чтобы ссылки/смоуки были воспроизводимы.
 */
export default getRequestConfig(async () => {
  const [store, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveRequestLocale({
    queryLocale: headerStore.get('x-it-audit-query-locale'),
    cookieLocale: store.get('locale')?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
