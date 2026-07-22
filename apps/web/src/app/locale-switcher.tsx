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
    document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = locale;
    router.refresh();
  };
  return (
    <nav
      aria-label={ariaLabel}
      className={`flex ${compact ? 'gap-0.5 text-xs' : 'gap-2 text-sm'}`}
      data-testid="locale-switcher"
    >
      {localeSchema.options.map((locale) => (
        <button
          key={locale}
          type="button"
          aria-current={locale === current ? 'true' : undefined}
          aria-label={`${ariaLabel}: ${locale.toUpperCase()}`}
          data-testid={`locale-${locale}`}
          onClick={() => setLocale(locale)}
          className={
            locale === current
              ? 'inline-flex min-h-8 min-w-8 items-center justify-center rounded-md bg-accent px-2 font-semibold text-on-primary shadow-sm'
              : 'inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 text-secondary transition-colors hover:bg-muted hover:text-foreground'
          }
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
