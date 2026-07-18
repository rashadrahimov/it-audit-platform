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
