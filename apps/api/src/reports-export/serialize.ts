/**
 * Сериализация ячеек выгрузки (T-098, REP-05). Вынесено из reports-export.service
 * для unit-теста (T-A21).
 */

/** CSV-ячейка (RFC-4180): кавычим, если есть ", запятая или перевод строки; " удваиваем. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** XML-текст: экранируем &, <, >, ". */
export function xmlEscape(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
