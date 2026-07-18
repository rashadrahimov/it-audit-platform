'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { loginAction, mfaVerifyAction, type LoginFormState } from './actions';

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

const initialState: LoginFormState = {};

export function LoginForm() {
  const t = useTranslations('auth');
  const [loginState, submitLogin] = useActionState(loginAction, initialState);
  const [mfaState, submitMfa] = useActionState(mfaVerifyAction, initialState);

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
    </form>
  );
}
