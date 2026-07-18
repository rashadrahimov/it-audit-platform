/**
 * Классификация риска (T-057, B6): класс по произведению impact×likelihood и
 * порогам матрицы тенанта. Вынесено из сервиса для unit-теста (T-A19).
 */

export interface RiskThresholds {
  medium: number;
  high: number;
  critical: number;
}

/** Дефолтные пороги классов по impact×likelihood (5×5 → max 25). */
export const DEFAULT_THRESHOLDS: RiskThresholds = { medium: 6, high: 12, critical: 20 };

/**
 * Класс риска: `null`, если impact или likelihood не заданы (0/undefined),
 * иначе low|medium|high|critical по возрастающим порогам.
 */
export function classifyRisk(
  impact: number | null | undefined,
  likelihood: number | null | undefined,
  thresholds: RiskThresholds,
): string | null {
  if (!impact || !likelihood) return null;
  const score = impact * likelihood;
  if (score >= thresholds.critical) return 'critical';
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.medium) return 'medium';
  return 'low';
}
