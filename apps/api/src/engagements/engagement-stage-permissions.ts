/**
 * Постадийные права члена аудит-команды (T-123, follow-up T-116).
 *
 * `engagement_member.engagement_role` задаёт роль в команде, а
 * `engagement_member.stage_permissions` (jsonb `{stage: level}`) переопределяет
 * права по конкретным стадиям. Здесь — ЧИСТАЯ логика «может ли член двигать
 * state-machine в целевую стадию», без БД (юнит-тестируемо).
 *
 * Enforcement — в `EngagementsService.transition`: НЕ-члены команды с RBAC
 * `engagement.edit` не ограничиваются (обратная совместимость T-116); ограничение
 * действует только на тех, кто явно в составе.
 */
import { ENGAGEMENT_APPROVER_ROLES, type EngagementRole } from '@it-audit/shared';

/** Уровни переопределения стадии (data-model §5: stage_permissions). */
export type StageLevel = 'edit' | 'read_only' | 'hidden';

/**
 * Стадии-«ворота» внутреннего утверждения/выпуска: вход в них двигают только
 * роли уровня утверждающего (`ENGAGEMENT_APPROVER_ROLES` = lead/approver).
 * `approval` — финальное внутреннее утверждение, `report_issued` — выпуск отчёта
 * (исходный гейт T-116). Прочие стадии — рабочие (двигает assessor и выше).
 */
export const SIGNOFF_STAGES: ReadonlySet<string> = new Set(['approval', 'report_issued']);

/**
 * Причина запрета перехода для члена команды (null = разрешено):
 * - `observer` — наблюдатель не двигает стадии;
 * - `signoff_requires_approver` — стадия-утверждение требует lead/approver;
 * - `stage_locked` — стадия явно закрыта членам через stage_permissions
 *   (`read_only`/`hidden`).
 */
export type TransitionDenial = 'observer' | 'signoff_requires_approver' | 'stage_locked' | null;

export function memberTransitionDenial(
  role: EngagementRole,
  stagePermissions: Record<string, string> | null,
  toStage: string,
): TransitionDenial {
  const override = stagePermissions?.[toStage];
  // Явный per-member грант поверх дефолта роли (даже observer / sign-off).
  if (override === 'edit') return null;
  // Явный per-member запрет поверх дефолта роли.
  if (override === 'read_only' || override === 'hidden') return 'stage_locked';
  if (role === 'observer') return 'observer';
  if (SIGNOFF_STAGES.has(toStage) && !ENGAGEMENT_APPROVER_ROLES.includes(role)) {
    return 'signoff_requires_approver';
  }
  return null;
}

/** Человекочитаемое сообщение запрета (для ForbiddenException). */
export function transitionDenialMessage(
  denial: Exclude<TransitionDenial, null>,
  role: string,
  toStage: string,
): string {
  switch (denial) {
    case 'observer':
      return `Роль «observer» (наблюдатель) не может двигать стадии engagement'а`;
    case 'signoff_requires_approver':
      return `Роль «${role}» не может перевести в стадию-утверждение «${toStage}» — нужен lead или approver`;
    case 'stage_locked':
      return `Стадия «${toStage}» закрыта для вас (stage_permissions: read_only/hidden)`;
  }
}
