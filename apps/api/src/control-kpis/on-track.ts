/**
 * on-track KPI (T-106, CTL-04): current достиг target с учётом направления.
 * Вынесено из сервиса для быстрого unit-теста (T-A18).
 * - lower_better: цель достигнута, если current <= target (напр. MTTR);
 * - higher_better: если current >= target (напр. покрытие тестами);
 * - null, если target или current не заданы (нечего сравнивать).
 */
export function onTrack(
  direction: string,
  target: number | null,
  current: number | null,
): boolean | null {
  if (target === null || current === null) return null;
  return direction === 'lower_better' ? current <= target : current >= target;
}
