import ExcelJS from 'exceljs';

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result ?? '').trim();
  }
  return String(value).trim();
}

const QUESTION_HEADERS = new Set([
  'question',
  'questions',
  'question text',
  'security question',
  'вопрос',
  'вопросы',
  'текст вопроса',
  'sual',
  'suallar',
]);

/**
 * Parse an inbound customer questionnaire. A named question column is preferred;
 * for headerless workbooks the first non-empty cell in each row is used.
 */
export async function parseQuestionnaireWorkbook(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const questions: string[] = [];

  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? (row.values as unknown[]).slice(1) : [];
      rows.push(values.map(cellText));
    });
    if (rows.length === 0) continue;

    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => QUESTION_HEADERS.has(cell.toLocaleLowerCase())),
    );
    const questionColumn =
      headerIndex >= 0
        ? rows[headerIndex]!.findIndex((cell) => QUESTION_HEADERS.has(cell.toLocaleLowerCase()))
        : 0;
    const start = headerIndex >= 0 ? headerIndex + 1 : 0;

    for (const row of rows.slice(start)) {
      const question = row[questionColumn]?.trim();
      if (question && !QUESTION_HEADERS.has(question.toLocaleLowerCase())) questions.push(question);
    }
  }

  return [...new Set(questions)];
}
