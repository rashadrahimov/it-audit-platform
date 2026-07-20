'use client';

import { useActionState } from 'react';
import { requestTrustAccessAction, type RequestState } from './actions';

interface Labels {
  requestTitle: string;
  requestHint: string;
  email: string;
  company: string;
  message: string;
  send: string;
  sent: string;
  error: string;
}

/** T-V30: публичная форма запроса доступа (client, useActionState для inline-фидбэка). */
export function RequestAccessForm({ slug, labels }: { slug: string; labels: Labels }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(
    requestTrustAccessAction.bind(null, slug),
    {},
  );

  if (state.ok) {
    return (
      <p
        data-testid="trust-request-sent"
        className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
      >
        {labels.sent}
      </p>
    );
  }

  return (
    <form action={action} data-testid="trust-request-form" className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{labels.requestTitle}</h2>
        <p className="mt-1 text-xs text-white/70">{labels.requestHint}</p>
      </div>
      <input
        name="email"
        type="email"
        required
        placeholder={labels.email}
        className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
      />
      <input
        name="company"
        placeholder={labels.company}
        className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
      />
      <textarea
        name="message"
        rows={2}
        placeholder={labels.message}
        className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
      />
      {state.error && <p className="text-xs text-red-300">{labels.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-white px-4 py-2 text-sm font-semibold text-primary transition-opacity duration-150 hover:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
      >
        {labels.send}
      </button>
    </form>
  );
}
