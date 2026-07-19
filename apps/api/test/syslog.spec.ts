import { describe, expect, it } from 'vitest';
import { escapeSdValue, toSyslog, toSyslogLines } from '../src/audit/syslog';

/** DoD LOG-06 (T-H09): RFC 5424 syslog-формат. Чистые функции, БД не нужна. */
describe('toSyslog (RFC 5424)', () => {
  const base = {
    action: 'finding.created',
    at: new Date('2026-07-19T10:00:00.000Z'),
    tenantId: 'ten-1',
    actorUserId: 'usr-1',
    actorIp: '10.0.0.1',
    entityType: 'finding',
    entityId: 'f-1',
  };

  it('формат: <PRI>1 TS HOST APP - MSGID [SD] MSG', () => {
    const line = toSyslog(base, 'host-a');
    expect(line).toBe(
      '<110>1 2026-07-19T10:00:00.000Z host-a it-audit - finding.created ' +
        '[origin@0 tenant="ten-1" actor="usr-1" ip="10.0.0.1" entity="finding/f-1"] finding.created finding',
    );
  });

  it('null-поля → плейсхолдеры (system/-)', () => {
    const line = toSyslog({ action: 'job.ran', at: base.at, actorUserId: null, tenantId: null });
    expect(line).toContain('tenant="-"');
    expect(line).toContain('actor="system"');
    expect(line).toContain('ip="-"');
  });

  it('строковый timestamp тоже принимается', () => {
    expect(toSyslog({ action: 'x', at: '2026-07-19T10:00:00.000Z' })).toContain(
      '2026-07-19T10:00:00.000Z',
    );
  });

  it('дефолтный hostname', () => {
    expect(toSyslog({ action: 'x', at: base.at })).toContain(' it-audit it-audit - ');
  });
});

describe('escapeSdValue (RFC 5424 §6.3.3)', () => {
  it('экранирует ", \\, ]', () => {
    expect(escapeSdValue('a"b')).toBe('a\\"b');
    expect(escapeSdValue('a\\b')).toBe('a\\\\b');
    expect(escapeSdValue('a]b')).toBe('a\\]b');
  });
  it('обычное значение без изменений', () => {
    expect(escapeSdValue('finding/f-1')).toBe('finding/f-1');
  });
});

describe('toSyslogLines', () => {
  it('по строке на событие', () => {
    const out = toSyslogLines([
      { action: 'a', at: new Date('2026-07-19T10:00:00.000Z') },
      { action: 'b', at: new Date('2026-07-19T10:00:00.000Z') },
    ]);
    expect(out.split('\n')).toHaveLength(2);
  });
  it('пусто → пустая строка', () => {
    expect(toSyslogLines([])).toBe('');
  });
});
