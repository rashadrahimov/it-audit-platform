'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('appState');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-10">
      <section
        role="alert"
        className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm"
        data-testid="route-error"
      >
        <p className="text-sm font-semibold text-red-700">{t('errorTitle')}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-primary">{t('errorHeading')}</h1>
        <p className="mt-3 text-sm leading-6 text-secondary">{t('errorBody')}</p>
        {error.digest && (
          <p className="mt-3 text-xs text-secondary">{t('digest', { digest: error.digest })}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {t('retry')}
        </button>
      </section>
    </main>
  );
}
