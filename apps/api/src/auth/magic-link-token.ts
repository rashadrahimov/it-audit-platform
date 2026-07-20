import { createHash, randomBytes } from 'node:crypto';

/**
 * Чистые примитивы magic-link токена (passwordless-вход). Вынесены из сервиса,
 * чтобы покрыть юнит-тестами без БД: генерация, хеширование, срок и пригодность.
 */

/** Сырой токен (в письме) + его sha256-хеш (в БД). Сам токен не хранится. */
export interface GeneratedMagicToken {
  token: string;
  tokenHash: string;
}

/** 32 байта энтропии, URL-safe base64 — безопасно кладётся в query ссылки. */
export function generateMagicToken(): GeneratedMagicToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashMagicToken(token) };
}

export function hashMagicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Момент истечения ссылки от `now` через `ttlMinutes`. */
export function magicLinkExpiresAt(now: Date, ttlMinutes: number): Date {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

/** Ссылка пригодна к обмену на токен: ещё не использована и не истекла. */
export function isMagicTokenUsable(
  row: { consumedAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  return row.consumedAt === null && row.expiresAt.getTime() > now.getTime();
}
