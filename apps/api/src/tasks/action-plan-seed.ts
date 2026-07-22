export const ACTION_PLAN_DUE_DAYS = {
  critical: 14,
  high: 30,
  medium: 60,
  low: 90,
  default: 60,
} as const;

const MAX_TASK_TITLE_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function truncateTaskTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_TASK_TITLE_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_TASK_TITLE_LENGTH - 1).trimEnd() + '…';
}

function addUtcDays(base: Date, days: number): Date {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days, 0, 0, 0, 0),
  );
}

export function acceptedAiControlClause(custom: unknown): string | null {
  if (!isRecord(custom)) return null;
  const ai = custom.ai;
  if (!isRecord(ai)) return null;
  if (ai.source !== 'finding_suggestion' || ai.decision !== 'accepted') return null;
  if (typeof ai.controlClause !== 'string') return null;
  const clause = ai.controlClause.trim();
  return clause.length > 0 ? clause : null;
}

export function suggestedDueDateForRisk(riskRating: string, baseDate = new Date()): Date {
  const key = riskRating.toLowerCase() as keyof typeof ACTION_PLAN_DUE_DAYS;
  const days = ACTION_PLAN_DUE_DAYS[key] ?? ACTION_PLAN_DUE_DAYS.default;
  return addUtcDays(baseDate, days);
}

export function recommendationTaskTitle(input: {
  recommendation: string;
  controlClause?: string | null;
}): string {
  const base = input.recommendation.trim();
  const clause = input.controlClause?.trim();
  if (!clause) return truncateTaskTitle(base);
  return truncateTaskTitle(`[${clause}] ${base}`);
}

export function legacyRecommendationTaskTitle(recommendation: string): string {
  return truncateTaskTitle(recommendation);
}
