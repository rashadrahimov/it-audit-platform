'use server';

import { apiFetch } from '@/lib/session';

export interface RequestState {
  ok?: boolean;
  error?: boolean;
}

/** T-V30: публичный запрос доступа к Trust Center (без auth). */
export async function requestTrustAccessAction(
  slug: string,
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: true };
  const company = String(formData.get('company') ?? '').trim();
  const message = String(formData.get('message') ?? '').trim();
  const res = await apiFetch(`/trust/${encodeURIComponent(slug)}/access-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      ...(company ? { company } : {}),
      ...(message ? { message } : {}),
    }),
  });
  return res.ok ? { ok: true } : { error: true };
}
