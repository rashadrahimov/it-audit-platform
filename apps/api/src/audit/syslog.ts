/**
 * RFC 5424 syslog-форматирование security-событий (LOG-06, T-H09). Чистые функции.
 * Facility 13 (log audit) × severity 6 (info) → PRI 110. Реальный форвардинг в
 * syslog-приёмник/ретеншн — инфра [!]; здесь формат + экспорт-строки (проверяемо).
 */

const PRI = 110; // 13*8 + 6
const APP_NAME = 'it-audit';

export interface SecurityEvent {
  action: string;
  at: Date | string;
  tenantId?: string | null;
  actorUserId?: string | null;
  actorIp?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/** Экранирование значения structured-data (RFC 5424 §6.3.3): ", \, ]. */
export function escapeSdValue(v: string): string {
  return v.replace(/([\\\]"])/g, '\\$1');
}

/** Одна строка RFC 5424: <PRI>1 TS HOST APP - MSGID [SD] MSG. */
export function toSyslog(event: SecurityEvent, hostname = 'it-audit'): string {
  const ts = (event.at instanceof Date ? event.at : new Date(event.at)).toISOString();
  const sdParams: Array<[string, string]> = [
    ['tenant', event.tenantId ?? '-'],
    ['actor', event.actorUserId ?? 'system'],
    ['ip', event.actorIp ?? '-'],
    ['entity', `${event.entityType ?? '-'}/${event.entityId ?? '-'}`],
  ];
  const sd = `[origin@0 ${sdParams.map(([k, v]) => `${k}="${escapeSdValue(v)}"`).join(' ')}]`;
  const msg = `${event.action} ${event.entityType ?? '-'}`;
  return `<${PRI}>1 ${ts} ${hostname} ${APP_NAME} - ${event.action} ${sd} ${msg}`;
}

/** Экспорт набора событий — по строке на событие (свежие сверху уже отсортированы вызывающим). */
export function toSyslogLines(events: SecurityEvent[], hostname?: string): string {
  return events.map((e) => toSyslog(e, hostname)).join('\n');
}
