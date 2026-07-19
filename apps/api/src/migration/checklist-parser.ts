/**
 * Парсер клиентского чеклист-шаблона (EP-MIGRATE, T-H11). Чистые функции: 13 колонок
 * (docs/client-templates/checklist-analysis.md) → доменные объекты. Чтение xlsx —
 * отдельно (parseChecklistWorkbook через exceljs). Реальные исторические файлы — [!].
 */

export interface ParsedChecklistRow {
  ref: string;
  domain: string | null;
  objective: string | null;
  question: string | null;
  auditeeResponse: string | null;
  evidence: string | null;
  complianceStatus: string | null;
  riskRating: string | null;
  finding: string | null;
  recommendation: string | null;
  owner: string | null;
  deadline: string | null;
  remediationStatus: string | null;
}

const COMPLIANCE: Record<string, string> = {
  compliant: 'compliant',
  'partially compliant': 'partially_compliant',
  'non-compliant': 'non_compliant',
  noncompliant: 'non_compliant',
  'not applicable': 'not_applicable',
  'n/a': 'not_applicable',
};

const RISK: Record<string, string> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  'n/a': '',
};

const REMEDIATION: Record<string, string> = {
  'not started': 'not_started',
  open: 'open',
  'in progress': 'in_progress',
  closed: 'closed',
  overdue: 'overdue',
};

const norm = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const mapEnum = (v: unknown, table: Record<string, string>): string | null => {
  const s = norm(v);
  if (!s) return null;
  const mapped = table[s.toLowerCase()];
  return mapped === undefined ? null : mapped || null;
};

/** Строка (13 ячеек A..M) → доменный объект. Пустой Ref → null (заголовок/пусто). */
export function parseChecklistRow(cells: unknown[]): ParsedChecklistRow | null {
  const ref = norm(cells[0]);
  if (!ref) return null;
  return {
    ref,
    domain: norm(cells[1]),
    objective: norm(cells[2]),
    question: norm(cells[3]),
    auditeeResponse: norm(cells[4]),
    evidence: norm(cells[5]),
    complianceStatus: mapEnum(cells[6], COMPLIANCE),
    riskRating: mapEnum(cells[7], RISK),
    finding: norm(cells[8]),
    recommendation: norm(cells[9]),
    owner: norm(cells[10]),
    deadline: norm(cells[11]),
    remediationStatus: mapEnum(cells[12], REMEDIATION),
  };
}

/** Формат control-ref: {DOMAIN}-{NN}, напр. GOV-01, AC-03. */
const REF_RE = /^[A-Z]{2,4}-\d+$/;

/** Набор строк → только контроли (строгий ref-формат отсекает заголовок/шапку/пустые). */
export function parseChecklistRows(rows: unknown[][]): ParsedChecklistRow[] {
  return rows
    .map((r) => parseChecklistRow(r))
    .filter((r): r is ParsedChecklistRow => r !== null && REF_RE.test(r.ref));
}
