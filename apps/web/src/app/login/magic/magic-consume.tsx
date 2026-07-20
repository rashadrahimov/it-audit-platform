'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  magicConsumeAction,
  mfaVerifyAction,
  type LoginFormState,
  type MagicConsumeState,
} from '../actions';

const inputClass =
  'w-full rounded-md border border-border bg-white px-3 py-2 text-foreground ' +
  'outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring';

const initialConsume: MagicConsumeState = {};
const initialMfa: LoginFormState = {};

function MfaSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
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

/**
 * Обмен magic-link на сессию. С JS — авто-сабмит на монтировании (одноразово, guard-ref);
 * без JS — кнопка «Завершить вход». MFA-аккаунт получает второй шаг тем же контрактом.
 */
export function MagicConsume({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(magicConsumeAction, initialConsume);
  const [mfaState, submitMfa] = useActionState(mfaVerifyAction, initialMfa);
  const autoSubmitted = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Авто-сабмит формы (не программный dispatch): реальный submit проходит тем же
  // путём, что клик — server-action redirect навигирует. Guard-ref = один раз.
  useEffect(() => {
    if (autoSubmitted.current) return;
    autoSubmitted.current = true;
    formRef.current?.requestSubmit();
  }, [token]);

  const mfaToken = mfaState.mfaToken ?? state.mfaToken;
  if (mfaToken) {
    return (
      <form action={submitMfa} className="flex flex-col gap-4" data-testid="magic-mfa">
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
        {mfaState.error ? (
          <p role="alert" className="text-sm text-destructive">
            {mfaState.error}
          </p>
        ) : null}
        <MfaSubmit label={t('verify')} pendingLabel={t('verifying')} />
      </form>
    );
  }

  if (state.error) {
    return (
      <div className="flex flex-col gap-4" data-testid="magic-error">
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  // Загрузка (JS) + no-JS fallback: явная кнопка завершения входа
  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col items-center gap-4"
      data-testid="magic-consume"
    >
      <input type="hidden" name="token" value={token} />
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <p className="text-sm text-secondary">{t('magicVerifying')}</p>
      <noscript>
        <button
          type="submit"
          className="w-full cursor-pointer rounded-md bg-accent px-4 py-2.5 font-semibold text-on-primary"
        >
          {t('magicComplete')}
        </button>
      </noscript>
    </form>
  );
}
