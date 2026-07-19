/**
 * Тренд-аналитика по снапшотам (RSK-08, T-H13). Чистые функции: серия значений
 * во времени → траектория (первое/последнее/дельта/направление). Поверх T-099 compare.
 */

export interface Trend {
  first: number;
  last: number;
  delta: number;
  direction: 'up' | 'down' | 'flat';
}

/** Траектория одной серии (по возрастанию времени). Пустая → нули/flat. */
export function computeTrend(values: number[]): Trend {
  if (values.length === 0) return { first: 0, last: 0, delta: 0, direction: 'flat' };
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = last - first;
  return { first, last, delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

/**
 * Тренд по каждому ключу группы. rows — снапшоты по возрастанию времени, каждый —
 * {key: value} для одной метрик-группы; ключ отсутствует в снапшоте = 0.
 */
export function computeGroupTrends(rows: Array<Record<string, number>>): Record<string, Trend> {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const out: Record<string, Trend> = {};
  for (const k of keys) out[k] = computeTrend(rows.map((r) => r[k] ?? 0));
  return out;
}
