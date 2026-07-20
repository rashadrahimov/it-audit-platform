import { describe, expect, it } from 'vitest';
import {
  generateMagicToken,
  hashMagicToken,
  isMagicTokenUsable,
  magicLinkExpiresAt,
} from '../src/auth/magic-link-token';

describe('magic-link-token', () => {
  it('генерирует URL-safe токен, хеш которого совпадает с hashMagicToken', () => {
    const { token, tokenHash } = generateMagicToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, без +/=
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(tokenHash).toBe(hashMagicToken(token));
    expect(tokenHash).toHaveLength(64); // sha256 hex
  });

  it('разные токены → разные хеши', () => {
    expect(generateMagicToken().tokenHash).not.toBe(generateMagicToken().tokenHash);
  });

  it('magicLinkExpiresAt отсчитывает минуты от now', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    expect(magicLinkExpiresAt(now, 15).toISOString()).toBe('2026-07-20T10:15:00.000Z');
  });

  it('isMagicTokenUsable: свежая неиспользованная — пригодна', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    expect(
      isMagicTokenUsable({ consumedAt: null, expiresAt: new Date('2026-07-20T10:05:00Z') }, now),
    ).toBe(true);
  });

  it('isMagicTokenUsable: использованная — непригодна даже до истечения', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    expect(
      isMagicTokenUsable(
        {
          consumedAt: new Date('2026-07-20T10:01:00Z'),
          expiresAt: new Date('2026-07-20T10:05:00Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('isMagicTokenUsable: истёкшая — непригодна', () => {
    const now = new Date('2026-07-20T10:10:00.000Z');
    expect(
      isMagicTokenUsable({ consumedAt: null, expiresAt: new Date('2026-07-20T10:05:00Z') }, now),
    ).toBe(false);
  });
});
