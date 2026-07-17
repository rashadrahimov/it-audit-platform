import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Параметры scrypt (OWASP-рекомендация N=2^15 для интерактивного логина). */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

/**
 * Хеширование паролей на node:crypto scrypt — без нативных зависимостей
 * (переносимость on-prem, ADR-0002). Формат: scrypt:N:r:p:salt64:hash64 —
 * параметры в строке, чтобы усиливать их без ломки старых хешей.
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
    return `scrypt:${N}:${R}:${P}:${salt.toString('base64')}:${key.toString('base64')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split(':');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, salt64, hash64] = parts;
    const expected = Buffer.from(hash64 as string, 'base64');
    const key = await scryptAsync(
      password,
      Buffer.from(salt64 as string, 'base64'),
      expected.length,
      {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: MAXMEM,
      },
    );
    return timingSafeEqual(key, expected);
  }
}
