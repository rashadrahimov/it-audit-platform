'use client';

import { useActionState } from 'react';
import { createApiKeyAction, type NewKeyState } from './actions';

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

interface Labels {
  namePh: string;
  add: string;
  once: string;
  error: string;
}

/** Форма создания ключа: показывает plaintext один раз (useActionState, без навигации). */
export function NewKeyForm({ labels }: { labels: Labels }) {
  const [state, formAction, pending] = useActionState<NewKeyState, FormData>(createApiKeyAction, {});

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} data-testid="apikey-create" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
        <input name="name" required placeholder={labels.namePh} className={`flex-1 ${inputCls}`} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {labels.add}
        </button>
      </form>

      {state.error && <p className="text-sm text-red-600">{labels.error}</p>}

      {state.key && (
        <div data-testid="apikey-plaintext" className="flex flex-col gap-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="text-xs font-medium text-emerald-700">{labels.once}</span>
          <code className="block overflow-x-auto rounded-md bg-white px-3 py-2 font-mono text-sm text-foreground select-all">
            {state.key}
          </code>
        </div>
      )}
    </div>
  );
}
