/**
 * Метрики инцидент-менеджмента (T-IR07) — чистая функция над метками фаз.
 * Отдельного хранилища нет: всё считается из `incident` (ADR-0024).
 */

export interface MetricsRow {
  status: string;
  severity: string;
  category: string | null;
  detectedAt: Date;
  triagedAt: Date | null;
  containedAt: Date | null;
  recoveredAt: Date | null;
  closedAt: Date | null;
  reportable: boolean;
  notifyDeadlineAt: Date | null;
  notifiedAt: Date | null;
}

export interface IncidentMetrics {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  /** Среднее время от обнаружения до фазы, в часах (null — не на чем считать). */
  meanHours: { toTriage: number | null; toContain: number | null; toRecover: number | null };
  regulator: { reportable: number; notified: number; onTime: number; overdue: number };
}

const HOUR = 3_600_000;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 10) / 10;
}

function bump(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

export function incidentMetrics(rows: MetricsRow[], now = new Date()): IncidentMetrics {
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const toTriage: number[] = [];
  const toContain: number[] = [];
  const toRecover: number[] = [];
  const regulator = { reportable: 0, notified: 0, onTime: 0, overdue: 0 };

  for (const r of rows) {
    bump(byStatus, r.status);
    bump(bySeverity, r.severity);
    bump(byCategory, r.category ?? 'uncategorized');
    const from = r.detectedAt.getTime();
    if (r.triagedAt) toTriage.push((r.triagedAt.getTime() - from) / HOUR);
    if (r.containedAt) toContain.push((r.containedAt.getTime() - from) / HOUR);
    // «восстановлено» — фактическая резолюция; для закрытых без фазы recovered берём closed
    const recovered = r.recoveredAt ?? (r.status === 'closed' ? r.closedAt : null);
    if (recovered) toRecover.push((recovered.getTime() - from) / HOUR);

    if (!r.reportable) continue;
    regulator.reportable += 1;
    if (r.notifiedAt) {
      regulator.notified += 1;
      // в срок = уведомили не позже дедлайна (дедлайна нет → считаем в срок)
      if (!r.notifyDeadlineAt || r.notifiedAt <= r.notifyDeadlineAt) regulator.onTime += 1;
      else regulator.overdue += 1;
    } else if (r.notifyDeadlineAt && r.notifyDeadlineAt < now) {
      regulator.overdue += 1;
    }
  }

  return {
    total: rows.length,
    open: rows.filter((r) => r.status !== 'closed').length,
    byStatus,
    bySeverity,
    byCategory,
    meanHours: {
      toTriage: mean(toTriage),
      toContain: mean(toContain),
      toRecover: mean(toRecover),
    },
    regulator,
  };
}
