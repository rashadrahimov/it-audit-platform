/**
 * State machine engagement'а (ADR-0005, data-model §8) — одна машина на оба режима:
 * formal — все переходы принудительные (строго следующая стадия),
 * light — согласовательные стадии можно пропускать.
 */
export const ENGAGEMENT_FLOW = [
  'draft',
  'manager_review',
  'issued_to_respondents',
  'responses_in_progress',
  'findings_drafting',
  'management_response',
  'approval',
  'report_issued',
  'follow_up',
  'closed',
] as const;

export type EngagementFlowState = (typeof ENGAGEMENT_FLOW)[number];
export type EngagementState = EngagementFlowState | 'paused' | 'archived';
export type EngagementMode = 'formal' | 'light';

/** Согласовательные стадии — только их разрешено пропускать в light-режиме. */
const APPROVAL_STAGES: ReadonlySet<string> = new Set([
  'manager_review',
  'management_response',
  'approval',
]);

const flowIndex = (state: string): number => ENGAGEMENT_FLOW.indexOf(state as EngagementFlowState);

export function canTransition(
  mode: EngagementMode,
  from: string,
  to: string,
  pausedFromState: string | null,
): boolean {
  if (from === to) return false;
  if (from === 'archived') return false;
  // resume: только туда, откуда встали на паузу (SCH-06)
  if (from === 'paused') return to === pausedFromState;
  if (to === 'paused') return flowIndex(from) >= 0 && from !== 'closed';
  if (to === 'archived') return from === 'closed';

  const fromIdx = flowIndex(from);
  const toIdx = flowIndex(to);
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return false;
  if (mode === 'formal') return toIdx === fromIdx + 1;
  // light: перескакивать можно только через согласовательные стадии
  return ENGAGEMENT_FLOW.slice(fromIdx + 1, toIdx).every((s) => APPROVAL_STAGES.has(s));
}

/** Допустимые переходы из состояния — для UI-кнопок. */
export function allowedTransitions(
  mode: EngagementMode,
  from: string,
  pausedFromState: string | null,
): EngagementState[] {
  const candidates: EngagementState[] = [...ENGAGEMENT_FLOW, 'paused', 'archived'];
  return candidates.filter((to) => canTransition(mode, from, to, pausedFromState));
}
