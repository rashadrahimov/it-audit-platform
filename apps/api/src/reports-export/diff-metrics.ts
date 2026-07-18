/**
 * Diff метрик двух снапшотов (T-099, REP-03): по каждой группе и ключу считает
 * {a, b, delta=b-a}. Объединение ключей обеих сторон, отсутствующее значение = 0.
 * Вынесено из reports-export.service для unit-теста (T-A20).
 */

export type MetricGroups = Record<string, Record<string, number>>;
export type MetricDiff = Record<string, Record<string, { a: number; b: number; delta: number }>>;

export function diffMetrics(ma: MetricGroups, mb: MetricGroups): MetricDiff {
  const metricNames = new Set([...Object.keys(ma), ...Object.keys(mb)]);
  const diff: MetricDiff = {};
  for (const m of metricNames) {
    const ka = ma[m] ?? {};
    const kb = mb[m] ?? {};
    const keys = new Set([...Object.keys(ka), ...Object.keys(kb)]);
    diff[m] = {};
    for (const k of keys) {
      const va = ka[k] ?? 0;
      const vb = kb[k] ?? 0;
      diff[m][k] = { a: va, b: vb, delta: vb - va };
    }
  }
  return diff;
}
