'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  disableMfaAction,
  enableMfaAction,
  setupMfaAction,
  type MfaDisableState,
  type MfaEnableState,
  type MfaSetupState,
} from './actions';

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const btnCls =
  'cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const setupInit: MfaSetupState = {};
const enableInit: MfaEnableState = {};
const disableInit: MfaDisableState = {};

/** T-V52: self-service MFA — включение (QR→код→recovery) и выключение (по коду). */
export function MfaSection({ enabled }: { enabled: boolean }) {
  const t = useTranslations('security');
  const [setupState, doSetup] = useActionState(setupMfaAction, setupInit);
  const [enableState, doEnable] = useActionState(enableMfaAction, enableInit);
  const [disableState, doDisable] = useActionState(disableMfaAction, disableInit);

  // Успешно включили — показать recovery-коды один раз
  if (enableState.recoveryCodes) {
    return (
      <div className="flex flex-col gap-3" data-testid="mfa-recovery">
        <p className="text-sm font-medium text-emerald-700">{t('enabledOk')}</p>
        <p className="text-xs text-secondary">{t('recoveryHint')}</p>
        <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-muted p-3 font-mono text-xs text-foreground">
          {enableState.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (enabled && !disableState.disabled) {
    return (
      <div className="flex flex-col gap-3" data-testid="mfa-enabled">
        <p className="text-sm text-foreground">
          <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {t('on')}
          </span>
          {t('enabledDesc')}
        </p>
        <form action={doDisable} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('codeToDisable')}</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              data-testid="mfa-disable-code"
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            data-testid="mfa-disable"
            className="cursor-pointer rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('disable')}
          </button>
        </form>
        {disableState.error && <p className="text-sm text-destructive">{t('badCode')}</p>}
      </div>
    );
  }

  if (disableState.disabled) {
    return (
      <p data-testid="mfa-disabled" className="text-sm text-secondary">
        {t('disabledOk')}
      </p>
    );
  }

  // Не включён: шаг 1 (кнопка) или шаг 2 (QR + код)
  if (!setupState.setup) {
    return (
      <div className="flex flex-col gap-3" data-testid="mfa-off">
        <p className="text-sm text-secondary">{t('offDesc')}</p>
        <form action={doSetup}>
          <button type="submit" data-testid="mfa-setup" className={`${btnCls} self-start`}>
            {t('enable')}
          </button>
        </form>
        {setupState.error && <p className="text-sm text-destructive">{t('setupError')}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="mfa-setup-step">
      <p className="text-sm text-secondary">{t('scanHint')}</p>
      <Image
        src={setupState.setup.qrDataUrl}
        alt="MFA QR"
        width={176}
        height={176}
        unoptimized
        className="h-44 w-44 rounded-md border border-border bg-white p-2"
      />
      <p className="text-xs text-secondary">
        {t('manualKey')}: <code className="font-mono">{setupState.setup.secret}</code>
      </p>
      <form action={doEnable} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-secondary">{t('codeToEnable')}</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            data-testid="mfa-enable-code"
            className={inputCls}
          />
        </label>
        <button type="submit" data-testid="mfa-enable" className={btnCls}>
          {t('confirm')}
        </button>
      </form>
      {enableState.error && <p className="text-sm text-destructive">{t('badCode')}</p>}
    </div>
  );
}
