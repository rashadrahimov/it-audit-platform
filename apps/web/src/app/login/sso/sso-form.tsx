'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ssoDiscoveryAction, type SsoDiscoveryState } from './actions';

const inputClass =
  'w-full rounded-md border border-border bg-white px-3 py-2 text-foreground ' +
  'outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full cursor-pointer rounded-md bg-accent px-4 py-2.5 font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

const initial: SsoDiscoveryState = {};

export function SsoForm() {
  const t = useTranslations('auth');
  const [state, submit] = useActionState(ssoDiscoveryAction, initial);

  if (state.decision === 'sso') {
    return (
      <div className="flex flex-col gap-4" data-testid="sso-result-sso">
        <div className="flex items-start gap-3 rounded-md border border-accent/30 bg-accent-soft p-3">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 h-5 w-5 shrink-0 text-accent"
          >
            <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-secondary">
            {t('ssoConfigured', { provider: state.providerLabel ?? '' })}
          </p>
        </div>
        <p className="text-xs text-secondary">{t('ssoContinueHint')}</p>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  if (state.decision === 'password') {
    return (
      <div className="flex flex-col gap-4" data-testid="sso-result-password">
        <p className="text-sm text-secondary">{t('ssoNotConfigured')}</p>
        <Link
          href="/login"
          data-testid="sso-to-password"
          className="w-full rounded-md bg-accent px-4 py-2.5 text-center font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90"
        >
          {t('ssoUsePassword')}
        </Link>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-4" data-testid="sso-form">
      <p className="text-sm text-secondary">{t('ssoHint')}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-secondary">{t('workEmail')}</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          autoFocus
          data-testid="sso-email"
          className={inputClass}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton label={t('ssoContinue')} pendingLabel={t('ssoChecking')} />
      <Link href="/login" className="text-center text-sm font-medium text-accent hover:underline">
        {t('backToLogin')}
      </Link>
    </form>
  );
}
