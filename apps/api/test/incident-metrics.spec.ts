import { describe, expect, it } from 'vitest';
import { incidentMetrics, type MetricsRow } from '../src/incidents/incident-metrics';

/**
 * DoD T-IR07 (EP-INC): метрики реагирования считаются из меток фаз — среднее время
 * до триажа/локализации/восстановления и дисциплина регуляторных уведомлений.
 */
const H = 3_600_000;
const t0 = new Date('2026-07-20T00:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * H);

const base: MetricsRow = {
  status: 'closed',
  severity: 'high',
  category: 'phishing',
  detectedAt: t0,
  triagedAt: null,
  containedAt: null,
  recoveredAt: null,
  closedAt: null,
  reportable: false,
  notifyDeadlineAt: null,
  notifiedAt: null,
};

describe('incident-metrics (T-IR07)', () => {
  it('пустой набор — нули и null вместо средних', () => {
    const m = incidentMetrics([]);
    expect(m.total).toBe(0);
    expect(m.open).toBe(0);
    expect(m.meanHours).toEqual({ toTriage: null, toContain: null, toRecover: null });
  });

  it('считает среднее время до фаз в часах', () => {
    const m = incidentMetrics([
      { ...base, triagedAt: at(1), containedAt: at(4), recoveredAt: at(10) },
      { ...base, triagedAt: at(3), containedAt: at(6), recoveredAt: at(20) },
    ]);
    expect(m.meanHours.toTriage).toBe(2);
    expect(m.meanHours.toContain).toBe(5);
    expect(m.meanHours.toRecover).toBe(15);
  });

  it('закрытый без фазы recovered учитывается по closed', () => {
    const m = incidentMetrics([{ ...base, status: 'closed', closedAt: at(8) }]);
    expect(m.meanHours.toRecover).toBe(8);
  });

  it('незакрытый без recovered в среднее не попадает', () => {
    const m = incidentMetrics([{ ...base, status: 'contained', containedAt: at(2) }]);
    expect(m.meanHours.toRecover).toBeNull();
    expect(m.open).toBe(1);
  });

  it('срезы по статусу, severity и категории (без категории — uncategorized)', () => {
    const m = incidentMetrics([
      { ...base, status: 'detected', severity: 'critical', category: null },
      { ...base, status: 'closed', severity: 'high', category: 'phishing' },
      { ...base, status: 'closed', severity: 'high', category: 'phishing' },
    ]);
    expect(m.total).toBe(3);
    expect(m.open).toBe(1);
    expect(m.byStatus).toEqual({ detected: 1, closed: 2 });
    expect(m.bySeverity).toEqual({ critical: 1, high: 2 });
    expect(m.byCategory).toEqual({ uncategorized: 1, phishing: 2 });
  });

  it('регуляторная дисциплина: в срок / просрочено / ещё не уведомлён', () => {
    const now = at(100);
    const m = incidentMetrics(
      [
        // уведомлён до дедлайна
        { ...base, reportable: true, notifyDeadlineAt: at(72), notifiedAt: at(50) },
        // уведомлён после дедлайна
        { ...base, reportable: true, notifyDeadlineAt: at(72), notifiedAt: at(80) },
        // не уведомлён, дедлайн прошёл
        { ...base, reportable: true, notifyDeadlineAt: at(90) },
        // не уведомлён, дедлайн впереди
        { ...base, reportable: true, notifyDeadlineAt: at(120) },
        // не подлежит уведомлению
        { ...base, reportable: false },
      ],
      now,
    );
    expect(m.regulator).toEqual({ reportable: 4, notified: 2, onTime: 1, overdue: 2 });
  });
});
