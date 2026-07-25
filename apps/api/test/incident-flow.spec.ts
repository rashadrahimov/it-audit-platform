import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  formatIncidentRef,
  INCIDENT_STATUSES,
  isIncidentStatus,
  notificationStatus,
  notifyDeadline,
  parseIncidentRef,
  PHASE_COLUMN,
} from '../src/incidents/incident-flow';

/**
 * DoD T-IR01 (EP-INC, ADR-0024), чистая часть: жизненный цикл инцидента —
 * строго вперёд по фазам + закрытие из любой; назад откатов нет.
 */
describe('incident-flow', () => {
  it('фазы идут строго вперёд', () => {
    expect(canTransition('detected', 'triaged')).toBe(true);
    expect(canTransition('triaged', 'contained')).toBe(true);
    expect(canTransition('contained', 'eradicated')).toBe(true);
    expect(canTransition('eradicated', 'recovered')).toBe(true);
    expect(canTransition('recovered', 'closed')).toBe(true);
  });

  it('перескок через фазу недопустим', () => {
    expect(canTransition('detected', 'contained')).toBe(false);
    expect(canTransition('triaged', 'recovered')).toBe(false);
  });

  it('назад откатиться нельзя', () => {
    expect(canTransition('contained', 'triaged')).toBe(false);
    expect(canTransition('closed', 'recovered')).toBe(false);
  });

  it('закрыть можно из любой фазы (ложное срабатывание)', () => {
    for (const s of INCIDENT_STATUSES) {
      if (s === 'closed') continue;
      expect(canTransition(s, 'closed')).toBe(true);
    }
  });

  it('из closed выходов нет', () => {
    expect(allowedTransitions('closed')).toEqual([]);
  });

  it('closed не дублируется в списке переходов из recovered', () => {
    expect(allowedTransitions('recovered')).toEqual(['closed']);
  });

  it('каждая фаза кроме detected ставит свою метку времени', () => {
    expect(PHASE_COLUMN.detected).toBeNull();
    expect(PHASE_COLUMN.triaged).toBe('triagedAt');
    expect(PHASE_COLUMN.closed).toBe('closedAt');
  });

  it('распознаёт статусы', () => {
    expect(isIncidentStatus('contained')).toBe(true);
    expect(isIncidentStatus('resolved')).toBe(false);
  });

  it('T-IR05: статус регуляторного уведомления', () => {
    const now = new Date('2026-07-25T12:00:00Z');
    const base = { reportable: true, notifiedAt: null, now };
    expect(notificationStatus({ ...base, reportable: false, deadlineAt: null })).toBe(
      'not_required',
    );
    expect(
      notificationStatus({
        ...base,
        deadlineAt: new Date('2026-07-26T12:00:00Z'),
        notifiedAt: now,
      }),
    ).toBe('notified');
    expect(notificationStatus({ ...base, deadlineAt: null })).toBe('no_deadline');
    expect(notificationStatus({ ...base, deadlineAt: new Date('2026-07-25T11:00:00Z') })).toBe(
      'overdue',
    );
    // дефолтное окно предупреждения — 24 часа
    expect(notificationStatus({ ...base, deadlineAt: new Date('2026-07-25T20:00:00Z') })).toBe(
      'due_soon',
    );
    expect(notificationStatus({ ...base, deadlineAt: new Date('2026-07-27T12:00:00Z') })).toBe(
      'ok',
    );
  });

  it('T-IR05: дедлайн уведомления = обнаружение + окно тенанта', () => {
    const detected = new Date('2026-07-25T00:00:00Z');
    expect(notifyDeadline(detected, 72).toISOString()).toBe('2026-07-28T00:00:00.000Z');
    expect(notifyDeadline(detected, 24).toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });

  it('номер инцидента — INC-NNNN, парсится обратно', () => {
    expect(formatIncidentRef(1)).toBe('INC-0001');
    expect(formatIncidentRef(42)).toBe('INC-0042');
    expect(formatIncidentRef(12345)).toBe('INC-12345');
    expect(parseIncidentRef('INC-0042')).toBe(42);
    expect(parseIncidentRef('мусор')).toBe(0);
    expect(parseIncidentRef(null)).toBe(0);
  });
});
