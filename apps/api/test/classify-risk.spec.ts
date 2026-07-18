import { describe, expect, it } from 'vitest';
import { classifyRisk, DEFAULT_THRESHOLDS } from '../src/risks/classify-risk';

/** DoD T-057/T-A19: класс риска по impact×likelihood и порогам. Чистая функция, БД не нужна. */
describe('classifyRisk (default 6/12/20, 5×5 матрица)', () => {
  const th = DEFAULT_THRESHOLDS;

  it('low: score < medium-порога', () => {
    expect(classifyRisk(1, 1, th)).toBe('low'); // 1
    expect(classifyRisk(2, 2, th)).toBe('low'); // 4
    expect(classifyRisk(1, 5, th)).toBe('low'); // 5
  });

  it('medium: medium ≤ score < high', () => {
    expect(classifyRisk(2, 3, th)).toBe('medium'); // 6 (граница)
    expect(classifyRisk(3, 3, th)).toBe('medium'); // 9
    expect(classifyRisk(1, 11, th)).toBe('medium'); // 11
  });

  it('high: high ≤ score < critical', () => {
    expect(classifyRisk(3, 4, th)).toBe('high'); // 12 (граница)
    expect(classifyRisk(4, 4, th)).toBe('high'); // 16
    expect(classifyRisk(1, 19, th)).toBe('high'); // 19
  });

  it('critical: score ≥ critical-порога', () => {
    expect(classifyRisk(4, 5, th)).toBe('critical'); // 20 (граница)
    expect(classifyRisk(5, 5, th)).toBe('critical'); // 25 (max)
  });

  it('null, если impact или likelihood не заданы', () => {
    expect(classifyRisk(null, 5, th)).toBeNull();
    expect(classifyRisk(5, null, th)).toBeNull();
    expect(classifyRisk(undefined, undefined, th)).toBeNull();
    expect(classifyRisk(0, 5, th)).toBeNull(); // 0 impact = не задан
  });

  it('уважает кастомные пороги матрицы тенанта', () => {
    const custom = { medium: 3, high: 5, critical: 9 };
    expect(classifyRisk(1, 3, custom)).toBe('medium'); // 3
    expect(classifyRisk(1, 4, custom)).toBe('medium'); // 4 (<5)
    expect(classifyRisk(1, 5, custom)).toBe('high'); // 5
    expect(classifyRisk(3, 3, custom)).toBe('critical'); // 9
  });
});
