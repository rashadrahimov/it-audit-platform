'use client';

import { useRouter } from 'next/navigation';
import { localeSchema, type Locale } from '@it-audit/shared';

/** Переключатель языка (T-022): пишет cookie и перерисовывает серверные компоненты. */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const setLocale = (locale: Locale) => {
    document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <nav aria-label="Language" className="flex gap-2 text-sm">
      {localeSchema.options.map((locale) => (
        <button
          key={locale}
          type="button"
          data-testid={`locale-${locale}`}
          onClick={() => setLocale(locale)}
          className={
            locale === current
              ? 'font-semibold text-neutral-900 underline'
              : 'text-neutral-500 hover:text-neutral-900'
          }
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
