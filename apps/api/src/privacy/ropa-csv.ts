/**
 * T-V55: импорт реестра ROPA (GDPR Art.30) из CSV. Чистый парсер — без БД, тестируемо.
 * Поддерживает RFC4180-кавычки, snake/camel/space-заголовки, мульти-значения через «;».
 */

const LEGAL_BASES = [
  'consent',
  'contract',
  'legal_obligation',
  'vital',
  'public',
  'legitimate',
] as const;
const ROLES = ['controller', 'processor', 'joint'] as const;
const TRUE_WORDS = new Set(['yes', 'true', '1', 'y', 'да']);

export interface RopaImportRow {
  name: string;
  legalBasis: string;
  purpose?: string;
  role: string;
  dataCategories: string[];
  dataSubjects: string[];
  recipients: string[];
  retentionPeriod?: string;
  crossBorder: boolean;
  dataLocations: string[];
}

export interface RopaParseResult {
  rows: RopaImportRow[];
  errors: string[];
}

/** Алиасы заголовков (после нормализации к lower + '_'). */
const COLUMN_ALIASES: Record<string, string> = {
  name: 'name',
  activity: 'name',
  legal_basis: 'legalBasis',
  legalbasis: 'legalBasis',
  basis: 'legalBasis',
  purpose: 'purpose',
  role: 'role',
  data_categories: 'dataCategories',
  datacategories: 'dataCategories',
  categories: 'dataCategories',
  data_subjects: 'dataSubjects',
  datasubjects: 'dataSubjects',
  subjects: 'dataSubjects',
  recipients: 'recipients',
  retention: 'retentionPeriod',
  retention_period: 'retentionPeriod',
  retentionperiod: 'retentionPeriod',
  cross_border: 'crossBorder',
  crossborder: 'crossBorder',
  data_locations: 'dataLocations',
  datalocations: 'dataLocations',
  locations: 'dataLocations',
};

function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/\s+/g, '_');
  return COLUMN_ALIASES[key] ?? '';
}

/** RFC4180-ish: разбить CSV на записи-массивы полей, учитывая кавычки и переводы строк. */
export function parseCsvRecords(csv: string): string[][] {
  const text = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let sawAny = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (c === ',') {
      record.push(field);
      field = '';
      sawAny = true;
    } else if (c === '\n') {
      record.push(field);
      records.push(record);
      field = '';
      record = [];
      sawAny = false;
    } else {
      field += c;
      sawAny = true;
    }
  }
  if (sawAny || field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function splitMulti(v: string): string[] {
  return v
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Разобрать CSV в валидные строки ROPA + список ошибок (по номеру строки). */
export function parseRopaCsv(csv: string): RopaParseResult {
  const records = parseCsvRecords(csv).filter((r) => r.some((c) => c.trim() !== ''));
  if (records.length === 0) return { rows: [], errors: ['CSV пуст'] };
  const header = (records[0] ?? []).map(normalizeHeader);
  if (!header.includes('name') || !header.includes('legalBasis')) {
    return { rows: [], errors: ['Обязательные колонки: name, legal_basis'] };
  }
  const errors: string[] = [];
  const rows: RopaImportRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r] ?? [];
    const get = (field: string) => {
      const idx = header.indexOf(field);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    const line = r + 1;
    const name = get('name');
    const legalBasis = get('legalBasis').toLowerCase();
    if (!name) {
      errors.push(`Строка ${line}: пустое name — пропущена`);
      continue;
    }
    if (!(LEGAL_BASES as readonly string[]).includes(legalBasis)) {
      errors.push(`Строка ${line}: legal_basis «${legalBasis || '—'}» недопустим — пропущена`);
      continue;
    }
    const roleRaw = get('role').toLowerCase();
    const role = (ROLES as readonly string[]).includes(roleRaw) ? roleRaw : 'controller';
    rows.push({
      name,
      legalBasis,
      purpose: get('purpose') || undefined,
      role,
      dataCategories: splitMulti(get('dataCategories')),
      dataSubjects: splitMulti(get('dataSubjects')),
      recipients: splitMulti(get('recipients')),
      retentionPeriod: get('retentionPeriod') || undefined,
      crossBorder: TRUE_WORDS.has(get('crossBorder').toLowerCase()),
      dataLocations: splitMulti(get('dataLocations')),
    });
  }
  return { rows, errors };
}
