'use server';

import { revalidatePath } from 'next/cache';
import {
  mfaEnableResponseSchema,
  mfaSetupResponseSchema,
  type MfaSetupResponse,
} from '@it-audit/shared';
import { apiFetch } from '@/lib/session';

export interface MfaSetupState {
  setup?: MfaSetupResponse;
  error?: string;
}
export interface MfaEnableState {
  recoveryCodes?: string[];
  error?: string;
}
export interface MfaDisableState {
  disabled?: boolean;
  error?: string;
}

/** T-V52: начать подключение MFA — секрет + QR (data-URL). */
export async function setupMfaAction(
  _prev: MfaSetupState,
  _formData: FormData,
): Promise<MfaSetupState> {
  const res = await apiFetch('/auth/mfa/setup', { method: 'POST' });
  if (!res.ok) return { error: 'setup' };
  const parsed = mfaSetupResponseSchema.safeParse(await res.json());
  if (!parsed.success) return { error: 'setup' };
  return { setup: parsed.data };
}

/** T-V52: включить MFA по TOTP-коду → recovery-коды (показать один раз). */
export async function enableMfaAction(
  _prev: MfaEnableState,
  formData: FormData,
): Promise<MfaEnableState> {
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { error: 'code' };
  const res = await apiFetch('/auth/mfa/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { error: 'badCode' };
  const parsed = mfaEnableResponseSchema.safeParse(await res.json());
  if (!parsed.success) return { error: 'badCode' };
  revalidatePath('/security');
  return { recoveryCodes: parsed.data.recoveryCodes };
}

/** T-V52: выключить MFA по TOTP-коду. */
export async function disableMfaAction(
  _prev: MfaDisableState,
  formData: FormData,
): Promise<MfaDisableState> {
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { error: 'code' };
  const res = await apiFetch('/auth/mfa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { error: 'badCode' };
  revalidatePath('/security');
  return { disabled: true };
}
