import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseQuestionnaireWorkbook } from '../src/questionnaires/questionnaire-workbook';

async function workbookBuffer(rows: string[][], sheetName = 'Questionnaire') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseQuestionnaireWorkbook', () => {
  it('finds a named question column and removes duplicates', async () => {
    const buffer = await workbookBuffer([
      ['ID', 'Question', 'Answer'],
      ['1', 'Do you encrypt data at rest?', ''],
      ['2', 'Do you test incident response?', ''],
      ['3', 'Do you encrypt data at rest?', ''],
    ]);
    await expect(parseQuestionnaireWorkbook(buffer)).resolves.toEqual([
      'Do you encrypt data at rest?',
      'Do you test incident response?',
    ]);
  });

  it('supports a headerless first column and multiple sheets', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('A').addRows([['First question?'], ['Second question?']]);
    workbook.addWorksheet('B').addRows([['Вопрос'], ['Третий вопрос?']]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseQuestionnaireWorkbook(buffer)).resolves.toEqual([
      'First question?',
      'Second question?',
      'Третий вопрос?',
    ]);
  });
});
