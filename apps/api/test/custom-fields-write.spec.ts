import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateCustomFieldValues } from '../src/custom-fields/custom-fields.service';

const defs = [
  {
    key: 'auditCycle',
    fieldType: 'select',
    options: ['Q1', 'Q2'],
    required: true,
  },
  {
    key: 'budget',
    fieldType: 'number',
    options: [],
    required: false,
  },
];

describe('custom-field write validation (GEN-07)', () => {
  it('не ломает legacy custom-payload, пока tenant не завёл definitions', () => {
    expect(
      validateCustomFieldValues(
        [],
        { anyLegacyKey: 'kept' },
        { allowUnknownWhenNoDefinitions: true },
      ),
    ).toEqual({ valid: true, checked: 0 });
  });

  it('после появления definitions валидирует required/type/select и unknown keys', () => {
    expect(validateCustomFieldValues(defs, { auditCycle: 'Q2', budget: 42 })).toEqual({
      valid: true,
      checked: 2,
    });

    expect(() => validateCustomFieldValues(defs, { auditCycle: 'Q3' })).toThrow(
      BadRequestException,
    );
    expect(() => validateCustomFieldValues(defs, { budget: 42 })).toThrow(BadRequestException);
    expect(() => validateCustomFieldValues(defs, { auditCycle: 'Q1', unknown: true })).toThrow(
      BadRequestException,
    );
  });
});
