'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { magicConsumeAction, mfaVerifyAction, type LoginFormState } from '../actions';

const inputClass =
  'w-full rounded-md border border-border bg-white px-3 py-2 text-foreground ' +
  'outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring';
const empty: LoginFormState = {};

/**
 * T-V36e: погашение magic-link. На маунте авто-сабмит токена; успех → server-action
 * редиректит на /account; MFA включён → форма второго шага; ошибка → сообщение + вход.
 */
export function MagicConsume({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, submit] = useActionState(magicConsumeAction, empty);
  const [mfaState, submitMfa] = useActionState(mfaVerifyAction, empty);
  const formRef = useRef<HTMLFormElement>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (!triggered.current && token) {
      triggered.current = true;
      formRef.current?.requestSubmit();
    }
  }, [token]);

  const mfaToken = mfaState.mfaToken ?? state.mfaToken;

  if (mfaToken) {
    return (
      <form action={submitMfa} className="flex flex-col gap-4" data-testid="magic-mfa">
        <p className="text-sm text-secondary">{t('mfaHint')}</p>
        <input type="hidden" name="mfaToken" value={mfaToken} />
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          data-testid="mfa-code"
          className={inputClass}
        />
        {mfaState.error && <p className="text-sm text-destructive">{mfaState.error}</p>}
        <button
          type="submit"
          className="w-full cursor-pointer rounded-md bg-accent px-4 py-2.5 font-semibold text-on-primary hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('verify')}
        </button>
      </form>
    );
  }

  if (!token || state.error) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p role="alert" data-testid="magic-error" className="text-sm text-destructive">
          {state.error ?? t('magicInvalid')}
        </p>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={submit} className="text-center">
      <input type="hidden" name="token" value={token} />
      <p data-testid="magic-consuming" className="text-sm text-secondary">
        {t('magicConsuming')}
      </p>
    </form>
  );
}
