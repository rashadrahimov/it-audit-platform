import ExcelJS from 'exceljs';
import { parseChecklistRows, type ParsedChecklistRow } from './checklist-parser';

/**
 * Чтение клиентского чеклист-шаблона .xlsx (EP-MIGRATE, T-H11) через exceljs.
 * Лист «Audit Checklist» (иначе первый) → строки → доменные объекты.
 */
export async function parseChecklistWorkbook(buffer: Buffer): Promise<ParsedChecklistRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet('Audit Checklist') ?? wb.worksheets[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow((row) => {
    // row.values — 1-индексный (values[0] пустой); срез → A..M как 0-индексные
    const vals = Array.isArray(row.values) ? (row.values as unknown[]).slice(1) : [];
    rows.push(
      vals.map((c) =>
        c && typeof c === 'object' && 'text' in c ? (c as { text: unknown }).text : c,
      ),
    );
  });
  return parseChecklistRows(rows);
}
