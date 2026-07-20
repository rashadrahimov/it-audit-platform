import { describe, expect, it } from 'vitest';
import { emailDomain } from '../src/sso-config/sso-config.service';

/** T-V49-dispatch: извлечение домена из email для SSO-discovery. */
describe('emailDomain', () => {
  it('извлекает домен в нижнем регистре', () => {
    expect(emailDomain('User@Corp.Example.com')).toBe('corp.example.com');
  });

  it('берёт часть после последнего @', () => {
    expect(emailDomain('a@b@corp.io')).toBe('corp.io');
  });

  it('без @ или пустой домен → пусто', () => {
    expect(emailDomain('nodomain')).toBe('');
    expect(emailDomain('trailing@')).toBe('');
  });
});
