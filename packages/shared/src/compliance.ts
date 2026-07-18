import { z } from 'zod';

/**
 * Compliance Status — фиксированные значения из чеклиста клиента
 * (checklist-analysis.md); конфигурируемые lookup'ы (GEN-06) — EP-CONFIG.
 */
export const complianceStatusSchema = z.enum([
  'compliant',
  'partially_compliant',
  'non_compliant',
  'not_applicable',
]);

export type ComplianceStatus = z.infer<typeof complianceStatusSchema>;

/** Risk Rating — фиксированные значения чеклиста клиента (Critical…N/A). */
export const riskRatingSchema = z.enum(['critical', 'high', 'medium', 'low', 'not_applicable']);

export type RiskRating = z.infer<typeof riskRatingSchema>;
