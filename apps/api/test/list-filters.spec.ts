import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { filterParam, uuidFilterParam } from '../src/list-filters';

/** DoD T-V16: валидация query-фильтров списков. Чистые функции, БД не нужна. */
describe('filterParam', () => {
  it('пропускает слаги статусов/типов', () => {
    expect(filterParam('in_review', 'status')).toBe('in_review');
    expect(filterParam('needs_attention', 'status')).toBe('needs_attention');
    expect(filterParam('GOV-01', 'q')).toBe('GOV-01');
    expect(filterParam('v1.2', 'type')).toBe('v1.2');
  });

  it('undefined и пустая строка → undefined (фильтр не применяется)', () => {
    expect(filterParam(undefined, 'status')).toBeUndefined();
    expect(filterParam('', 'status')).toBeUndefined();
  });

  it('мусорный формат → 400', () => {
    expect(() => filterParam('a b', 'status')).toThrow(BadRequestException);
    expect(() => filterParam("x';drop", 'status')).toThrow(BadRequestException);
    expect(() => filterParam('я-статус', 'status')).toThrow(BadRequestException);
    expect(() => filterParam('a'.repeat(65), 'status')).toThrow(BadRequestException);
  });
});

describe('uuidFilterParam', () => {
  it('пропускает валидный UUID, отбрасывает пустое', () => {
    expect(uuidFilterParam('0198c3ab-1111-7000-8000-000000000001', 'ownerMembershipId')).toBe(
      '0198c3ab-1111-7000-8000-000000000001',
    );
    expect(uuidFilterParam(undefined, 'x')).toBeUndefined();
    expect(uuidFilterParam('', 'x')).toBeUndefined();
  });

  it('не-UUID → 400', () => {
    expect(() => uuidFilterParam('123', 'ownerMembershipId')).toThrow(BadRequestException);
    expect(() => uuidFilterParam('zzzzzzzz-1111-7000-8000-000000000001', 'x')).toThrow(
      BadRequestException,
    );
  });
});
