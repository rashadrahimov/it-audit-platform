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

/** Человекочитаемый номер инцидента: 1 → INC-0001. */
export function formatIncidentRef(seq: number): string {
  return `INC-${String(seq).padStart(4, '0')}`;
}

/** Обратно: INC-0042 → 42; мусор → 0 (нумерация продолжится с максимума). */
export function parseIncidentRef(ref: string | null | undefined): number {
  const m = /^INC-(\d+)$/.exec(ref ?? '');
  return m ? Number(m[1]) : 0;
}
