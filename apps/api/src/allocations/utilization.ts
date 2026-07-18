/**
 * Утилизация участника (T-102, SCH-03): доля назначенных часов к ёмкости.
 * Вынесено из allocations.service для unit-теста (T-A25).
 * - utilizationPct: округлённый процент; null, если capacity ≤ 0 (делить не на что);
 * - overallocated: назначено больше ёмкости.
 */
export function deriveUtilization(
  allocated: number,
  capacity: number,
): { utilizationPct: number | null; overallocated: boolean } {
  return {
    utilizationPct: capacity > 0 ? Math.round((allocated / capacity) * 100) : null,
    overallocated: capacity > 0 && allocated > capacity,
  };
}
