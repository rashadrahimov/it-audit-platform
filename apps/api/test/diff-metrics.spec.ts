import { describe, expect, it } from 'vitest';
import { diffMetrics } from '../src/reports-export/diff-metrics';

/** DoD T-099/T-A20: diff двух снапшотов метрик. Чистая функция, БД не нужна. */
describe('diffMetrics (сравнение снапшотов)', () => {
  it('delta = b - a по каждому ключу', () => {
    const a = { risks_by_class: { high: 2, low: 5 } };
    const b = { risks_by_class: { high: 5, low: 3 } };
    expect(diffMetrics(a, b)).toEqual({
      risks_by_class: {
        high: { a: 2, b: 5, delta: 3 },
        low: { a: 5, b: 3, delta: -2 },
      },
    });
  });

  it('ключ есть только в b → a=0', () => {
    const a = { m: {} };
    const b = { m: { critical: 4 } };
    expect(diffMetrics(a, b).m!.critical).toEqual({ a: 0, b: 4, delta: 4 });
  });

  it('ключ есть только в a → b=0, delta отрицательная', () => {
    const a = { m: { critical: 4 } };
    const b = { m: {} };
    expect(diffMetrics(a, b).m!.critical).toEqual({ a: 4, b: 0, delta: -4 });
  });

  it('группа метрик есть только в одной стороне', () => {
    const a = { onlyA: { x: 1 } };
    const b = { onlyB: { y: 2 } };
    const d = diffMetrics(a, b);
    expect(d.onlyA!.x).toEqual({ a: 1, b: 0, delta: -1 });
    expect(d.onlyB!.y).toEqual({ a: 0, b: 2, delta: 2 });
  });

  it('идентичные снапшоты → все delta = 0', () => {
    const same = { controls_total: { total: 32 } };
    const d = diffMetrics(same, same);
    expect(d.controls_total!.total).toEqual({ a: 32, b: 32, delta: 0 });
  });

  it('пустые метрики → пустой diff', () => {
    expect(diffMetrics({}, {})).toEqual({});
  });
});
