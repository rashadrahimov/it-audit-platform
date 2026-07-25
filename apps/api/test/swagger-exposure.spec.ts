import { describe, expect, it } from 'vitest';
import { resolveSwaggerEnabled } from '../src/env';

/**
 * DoD T-OPS04 (EP-OPS): решение по публикации OpenAPI. Спека — требование RFP INT-01,
 * но анонимный `/docs-json` в проде отдаёт карту всей поверхности API (вскрыто при проверке
 * продового деплоя EP-INC). Правило: в проде закрыто, включается явным флагом.
 */
describe('публикация OpenAPI (T-OPS04)', () => {
  it('в production по умолчанию выключено', () => {
    expect(resolveSwaggerEnabled('production', undefined)).toBe(false);
  });

  it('в dev по умолчанию включено (verify-скилл ходит в /docs)', () => {
    expect(resolveSwaggerEnabled('development', undefined)).toBe(true);
    expect(resolveSwaggerEnabled(undefined, undefined)).toBe(true);
  });

  it('явный флаг перебивает окружение в обе стороны', () => {
    expect(resolveSwaggerEnabled('production', 'true')).toBe(true);
    expect(resolveSwaggerEnabled('development', 'false')).toBe(false);
  });

  it('мусорное значение флага трактуется как выключено (fail-closed)', () => {
    expect(resolveSwaggerEnabled('production', 'yes')).toBe(false);
    expect(resolveSwaggerEnabled('development', '1')).toBe(false);
  });
});
