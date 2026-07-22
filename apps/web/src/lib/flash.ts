import { cookies } from 'next/headers';
import { FLASH_COOKIE, type FlashKind, type FlashPayload } from './flash-contract';

export { FLASH_COOKIE, type FlashKind, type FlashPayload };

export async function setFlash(kind: FlashKind, key: string): Promise<void> {
  const store = await cookies();
  store.set(
    FLASH_COOKIE,
    encodeURIComponent(JSON.stringify({ kind, key } satisfies FlashPayload)),
    {
      path: '/',
      maxAge: 30,
      sameSite: 'lax',
    },
  );
}

export async function readFlash(): Promise<FlashPayload | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<FlashPayload>;
    if ((parsed.kind === 'success' || parsed.kind === 'error') && typeof parsed.key === 'string') {
      return { kind: parsed.kind, key: parsed.key };
    }
  } catch {
    return null;
  }
  return null;
}
