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

/**
 * Статус review доказательства (T-112, EP-AUDITOR-RELATIONSHIP) — аналог
 * Vanta evidence tracker. Проставляется на document_link:
 * - not_ready — ещё не готово к аудиту (дефолт);
 * - ready — auditee пометил готовым к ревью;
 * - accepted — аудитор принял;
 * - flagged — аудитор вернул на доработку;
 * - not_applicable — неприменимо.
 */
export const evidenceReviewStatusSchema = z.enum([
  'not_ready',
  'ready',
  'accepted',
  'flagged',
  'not_applicable',
]);

export type EvidenceReviewStatus = z.infer<typeof evidenceReviewStatusSchema>;
