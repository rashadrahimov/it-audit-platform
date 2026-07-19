import { describe, expect, it } from 'vitest';
import { maskFields, rejectedWriteFields, type FieldLevels } from '../src/rbac/field-policy';

/** DoD SEC-04 (T-H03): чистые хелперы field-level enforcement. БД не нужна. */
describe('maskFields (чтение)', () => {
  const obj = { id: '1', title: 'T', recommendation: 'secret', riskRating: 'high' };

  it('вырезает hidden-поля, остальное сохраняет', () => {
    const levels: FieldLevels = { recommendation: 'hidden' };
    expect(maskFields(obj, levels)).toEqual({ id: '1', title: 'T', riskRating: 'high' });
  });

  it('view/edit не скрываются', () => {
    const levels: FieldLevels = { recommendation: 'view', riskRating: 'edit' };
    expect(maskFields(obj, levels)).toEqual(obj);
  });

  it('пустые levels — объект без изменений (и не мутирован)', () => {
    expect(maskFields(obj, {})).toEqual(obj);
    expect(maskFields(obj, {})).toBe(obj); // fast-path: тот же объект
  });

  it('несколько hidden', () => {
    const levels: FieldLevels = { recommendation: 'hidden', riskRating: 'hidden' };
    expect(maskFields(obj, levels)).toEqual({ id: '1', title: 'T' });
  });

  it('не мутирует исходный объект', () => {
    const levels: FieldLevels = { recommendation: 'hidden' };
    maskFields(obj, levels);
    expect(obj.recommendation).toBe('secret');
  });
});

describe('rejectedWriteFields (запись)', () => {
  it('поле с hidden/view во входе — отклоняется', () => {
    const levels: FieldLevels = { recommendation: 'hidden', riskRating: 'view' };
    expect(rejectedWriteFields({ recommendation: 'x', title: 'ok' }, levels)).toEqual([
      'recommendation',
    ]);
    expect(rejectedWriteFields({ riskRating: 'low' }, levels)).toEqual(['riskRating']);
  });

  it('поле с edit — можно писать', () => {
    const levels: FieldLevels = { recommendation: 'edit' };
    expect(rejectedWriteFields({ recommendation: 'x' }, levels)).toEqual([]);
  });

  it('поле вне levels — не ограничено', () => {
    expect(rejectedWriteFields({ title: 'x' }, { recommendation: 'hidden' })).toEqual([]);
  });

  it('пустой вход/levels — нет отклонённых', () => {
    expect(rejectedWriteFields({}, {})).toEqual([]);
  });
});
