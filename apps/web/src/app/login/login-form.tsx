'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  loginAction,
  magicLinkRequestAction,
  mfaVerifyAction,
  type LoginFormState,
  type MagicRequestState,
} from './actions';

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

function ErrorAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid="login-error" className="text-sm text-destructive">
      {message}
    </p>
  );
}

const initialLogin: LoginFormState = {};
const initialMagic: MagicRequestState = {};

export function LoginForm() {
  const t = useTranslations('auth');
  const [loginState, submitLogin] = useActionState(loginAction, initialLogin);
  const [mfaState, submitMfa] = useActionState(mfaVerifyAction, initialLogin);
  const [magicState, submitMagic] = useActionState(magicLinkRequestAction, initialMagic);
  const [mode, setMode] = useState<'password' | 'magic'>('password');

  // MFA-челлендж живёт в состоянии первого шага; ошибки второго — в своём
  const mfaToken = mfaState.mfaToken ?? loginState.mfaToken;

  if (mfaToken) {
    return (
      <form action={submitMfa} className="flex flex-col gap-4">
        <p className="text-sm text-secondary">{t('mfaHint')}</p>
        <input type="hidden" name="mfaToken" value={mfaToken} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-secondary">{t('mfaCode')}</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            data-testid="mfa-code"
            className={inputClass}
          />
        </label>
        <ErrorAlert message={mfaState.error} />
        <SubmitButton label={t('verify')} pendingLabel={t('verifying')} />
      </form>
    );
  }

  // Passwordless-ветка: запрос ссылки на email (аддитивно рядом с паролем)
  if (mode === 'magic') {
    if (magicState.sent) {
      return (
        <div className="flex flex-col gap-4" data-testid="magic-sent">
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
              <path d="M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
            <p className="text-sm text-secondary">{t('magicSent')}</p>
          </div>
          <button
            type="button"
            onClick={() => setMode('password')}
            className="cursor-pointer text-sm font-medium text-accent hover:underline"
          >
            {t('backToPassword')}
          </button>
        </div>
      );
    }
    return (
      <form action={submitMagic} className="flex flex-col gap-4" data-testid="magic-form">
        <p className="text-sm text-secondary">{t('magicHint')}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-secondary">{t('email')}</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            autoFocus
            data-testid="magic-email"
            className={inputClass}
          />
        </label>
        <ErrorAlert message={magicState.error} />
        <SubmitButton label={t('magicSend')} pendingLabel={t('magicSending')} />
        <button
          type="button"
          onClick={() => setMode('password')}
          className="cursor-pointer text-sm font-medium text-accent hover:underline"
        >
          {t('backToPassword')}
        </button>
      </form>
    );
  }

  return (
    <form action={submitLogin} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-secondary">{t('email')}</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          data-testid="login-email"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-secondary">{t('password')}</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          data-testid="login-password"
          className={inputClass}
        />
      </label>
      <ErrorAlert message={loginState.error} />
      <SubmitButton label={t('signIn')} pendingLabel={t('signingIn')} />

      <div className="flex items-center gap-3 py-0.5 text-xs text-secondary">
        <span className="h-px flex-1 bg-border" />
        {t('or')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <button
        type="button"
        onClick={() => setMode('magic')}
        data-testid="magic-toggle"
        className="w-full cursor-pointer rounded-md border border-border bg-white px-4 py-2.5 font-semibold text-primary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('magicToggle')}
      </button>
    </form>
  );
}
