/**
 * Жизненный цикл инцидента (T-IR01, ADR-0024) — чистая логика, тестируется без БД.
 * NIST 800-61, сокращённый до практичного: detected→triaged→contained→eradicated→recovered→closed.
 */

export const INCIDENT_STATUSES = [
  'detected',
  'triaged',
  'contained',
  'eradicated',
  'recovered',
  'closed',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

/** Категории инцидента: категории алертов + специфика инцидентов (утечка, простой, инсайдер). */
export const INCIDENT_CATEGORIES = [
  'malware',
  'phishing',
  'vulnerability',
  'misconfiguration',
  'unauthorized_access',
  'data_breach',
  'service_outage',
  'insider',
  'physical',
  'other',
] as const;

export const INCIDENT_SOURCES = ['manual', 'alert', 'connector'] as const;

/** Виды записей таймлайна. */
export const INCIDENT_EVENT_KINDS = ['status_change', 'note', 'action', 'notification'] as const;

/**
 * Что можно связать с инцидентом (T-IR02): вошедшие сигналы, затронутое,
 * порождённые findings. Пара entity_type+entity_id вместо FK-зоопарка (ADR-0024).
 */
export const INCIDENT_LINK_TYPES = [
  'security_alert',
  'vulnerability',
  'asset',
  'device',
  'risk',
  'control',
  'vendor',
  'finding',
] as const;
export type IncidentLinkType = (typeof INCIDENT_LINK_TYPES)[number];

/**
 * Разрешённые переходы: строго вперёд по фазам + закрытие из любой (ложное срабатывание
 * закрывается сразу). Назад не откатываемся — откат оформляется записью в таймлайне.
 */
const FORWARD: Record<IncidentStatus, IncidentStatus | null> = {
  detected: 'triaged',
  triaged: 'contained',
  contained: 'eradicated',
  eradicated: 'recovered',
  recovered: 'closed',
  closed: null,
};

export function isIncidentStatus(value: string): value is IncidentStatus {
  return (INCIDENT_STATUSES as readonly string[]).includes(value);
}

/** Куда можно уйти из статуса: следующая фаза + closed. */
export function allowedTransitions(from: IncidentStatus): IncidentStatus[] {
  const next = FORWARD[from];
  const out: IncidentStatus[] = [];
  if (next) out.push(next);
  if (from !== 'closed' && next !== 'closed') out.push('closed');
  return out;
}

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/** Колонка-метка фазы, которую проставляет переход (detected ставится при создании). */
export const PHASE_COLUMN: Record<IncidentStatus, string | null> = {
  detected: null,
  triaged: 'triagedAt',
  contained: 'containedAt',
  eradicated: 'eradicatedAt',
  recovered: 'recoveredAt',
  closed: 'closedAt',
};

/**
 * T-IR05: состояние регуляторного уведомления (IR-02/CBAR, breach приватности).
 * Чистая функция — срок считается от `detected_at`, а не от заведения записи.
 */
export type NotificationStatus =
  'not_required' | 'notified' | 'ok' | 'due_soon' | 'overdue' | 'no_deadline';

export function notificationStatus(input: {
  reportable: boolean;
  deadlineAt: Date | null;
  notifiedAt: Date | null;
  now?: Date;
  dueSoonHours?: number;
}): NotificationStatus {
  if (!input.reportable) return 'not_required';
  if (input.notifiedAt) return 'notified';
  if (!input.deadlineAt) return 'no_deadline';
  const now = input.now ?? new Date();
  const left = input.deadlineAt.getTime() - now.getTime();
  if (left < 0) return 'overdue';
  const soon = (input.dueSoonHours ?? 24) * 3600 * 1000;
  return left <= soon ? 'due_soon' : 'ok';
}

/** Дедлайн уведомления: обнаружение + окно тенанта (по умолчанию 72 ч, как GDPR). */
export function notifyDeadline(detectedAt: Date, hours: number): Date {
  return new Date(detectedAt.getTime() + hours * 3600 * 1000);
}

/** Человекочитаемый номер инцидента: 1 → INC-0001. */
export function formatIncidentRef(seq: number): string {
  return `INC-${String(seq).padStart(4, '0')}`;
}

/** Обратно: INC-0042 → 42; мусор → 0 (нумерация продолжится с максимума). */
export function parseIncidentRef(ref: string | null | undefined): number {
  const m = /^INC-(\d+)$/.exec(ref ?? '');
  return m ? Number(m[1]) : 0;
}
