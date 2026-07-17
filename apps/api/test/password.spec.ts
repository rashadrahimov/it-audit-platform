import { describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service';
import {
  DEFAULT_PASSWORD_POLICY,
  resolvePolicy,
  validatePassword,
} from '../src/auth/password-policy';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('хеширует и верифицирует пароль', async () => {
    const hash = await service.hash('Correct-Horse-7');
    expect(hash.startsWith('scrypt:')).toBe(true);
    expect(hash).not.toContain('Correct-Horse-7');
    await expect(service.verify('Correct-Horse-7', hash)).resolves.toBe(true);
  });

  it('отвергает неверный пароль и мусорный хеш', async () => {
    const hash = await service.hash('Correct-Horse-7');
    await expect(service.verify('wrong', hash)).resolves.toBe(false);
    await expect(service.verify('x', 'не-хеш')).resolves.toBe(false);
  });

  it('соль уникальна — хеши одного пароля различаются', async () => {
    expect(await service.hash('same')).not.toBe(await service.hash('same'));
  });
});

describe('password policy', () => {
  it('дефолтная политика ловит короткие/простые пароли', () => {
    expect(validatePassword('Str0ngEnough-Pass', DEFAULT_PASSWORD_POLICY)).toHaveLength(0);
    expect(validatePassword('short1A', DEFAULT_PASSWORD_POLICY)).not.toHaveLength(0);
    expect(validatePassword('nouppercase111!', DEFAULT_PASSWORD_POLICY)).not.toHaveLength(0);
    expect(validatePassword('NODIGITSHERE-AA', DEFAULT_PASSWORD_POLICY)).not.toHaveLength(0);
  });

  it('per-tenant override сливается с дефолтом (SEC-01)', () => {
    const policy = resolvePolicy({ passwordPolicy: { minLength: 20, requireSpecial: true } });
    expect(policy.minLength).toBe(20);
    expect(policy.requireSpecial).toBe(true);
    expect(policy.lockoutThreshold).toBe(DEFAULT_PASSWORD_POLICY.lockoutThreshold);
    expect(resolvePolicy(null)).toEqual(DEFAULT_PASSWORD_POLICY);
    expect(resolvePolicy({})).toEqual(DEFAULT_PASSWORD_POLICY);
  });
});
