'use client';

import { useRouter } from 'next/navigation';
import { localeSchema, type Locale } from '@it-audit/shared';

/** Переключатель языка (T-022): пишет cookie и перерисовывает серверные компоненты. */
export function LocaleSwitcher({
  current,
  ariaLabel = 'Language',
  compact = false,
}: {
  current: Locale;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const setLocale = (locale: Locale) => {
    document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <nav aria-label={ariaLabel} className={`flex ${compact ? 'gap-0.5 text-xs' : 'gap-2 text-sm'}`}>
      {localeSchema.options.map((locale) => (
        <button
          key={locale}
          type="button"
          data-testid={`locale-${locale}`}
          onClick={() => setLocale(locale)}
          className={
            locale === current
              ? 'inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-4'
              : 'inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 text-secondary hover:bg-muted hover:text-foreground'
          }
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
