import { z } from 'zod';

/**
 * Категория membership (data-model §2, T-107): к какой стороне относится участник тенанта.
 * - auditor — своя (внутренняя) аудит-команда группы;
 * - respondent — auditee, отвечает на чеклист;
 * - msp — внешний подрядчик (managed service provider);
 * - external_auditor — внешний аудитор со scoped-доступом (EP-AUDITOR-RELATIONSHIP).
 */
export const membershipCategorySchema = z.enum([
  'auditor',
  'respondent',
  'msp',
  'external_auditor',
]);

export type MembershipCategory = z.infer<typeof membershipCategorySchema>;
