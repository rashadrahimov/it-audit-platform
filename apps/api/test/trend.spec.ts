import { describe, expect, it } from 'vitest';
import { computeGroupTrends, computeTrend } from '../src/reports-export/trend';

/** DoD RSK-08 (T-H13): траектория серии по снапшотам. Чистые функции. */
describe('computeTrend', () => {
  it('рост → direction up, delta>0', () => {
    expect(computeTrend([2, 3, 5])).toEqual({ first: 2, last: 5, delta: 3, direction: 'up' });
  });
  it('спад → down', () => {
    expect(computeTrend([5, 4, 1])).toEqual({ first: 5, last: 1, delta: -4, direction: 'down' });
  });
  it('без изменений → flat', () => {
    expect(computeTrend([3, 7, 3])).toEqual({ first: 3, last: 3, delta: 0, direction: 'flat' });
  });
  it('одна точка → flat', () => {
    expect(computeTrend([4])).toEqual({ first: 4, last: 4, delta: 0, direction: 'flat' });
  });
  it('пусто → нули/flat', () => {
    expect(computeTrend([])).toEqual({ first: 0, last: 0, delta: 0, direction: 'flat' });
  });
});

describe('computeGroupTrends', () => {
  it('тренд по каждому ключу; отсутствующий ключ в снапшоте = 0', () => {
    const rows: Array<Record<string, number>> = [
      { critical: 1, high: 4 },
      { critical: 3, high: 2, low: 5 },
    ];
    const t = computeGroupTrends(rows);
    expect(t.critical).toEqual({ first: 1, last: 3, delta: 2, direction: 'up' });
    expect(t.high).toEqual({ first: 4, last: 2, delta: -2, direction: 'down' });
    expect(t.low).toEqual({ first: 0, last: 5, delta: 5, direction: 'up' }); // не было в 1-м → 0
  });
  it('пустой набор снапшотов → пустой объект', () => {
    expect(computeGroupTrends([])).toEqual({});
  });
});
