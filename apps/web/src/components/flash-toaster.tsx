'use client';

import { useEffect, useState } from 'react';
import { FLASH_COOKIE, type FlashPayload } from '@/lib/flash-contract';

export function FlashToaster({
  flash,
  labels,
}: {
  flash: FlashPayload | null;
  labels: Record<string, string>;
}) {
  const [visible, setVisible] = useState(Boolean(flash));

  useEffect(() => {
    if (!flash) return;
    document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    const timer = window.setTimeout(() => setVisible(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  if (!flash || !visible) return null;

  const message = labels[flash.key] ?? labels.saved ?? flash.key;
  const success = flash.kind === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="flash-toast"
      className={`fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg ${
        success ? 'border-emerald-200 text-emerald-900' : 'border-red-200 text-red-900'
      }`}
    >
      <span
        aria-hidden
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${success ? 'bg-emerald-600' : 'bg-red-600'}`}
      />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={labels.close ?? 'Close'}
        className="rounded-md px-1 text-secondary transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        ×
      </button>
    </div>
  );
}
