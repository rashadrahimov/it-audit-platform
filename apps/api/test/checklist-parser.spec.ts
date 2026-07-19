import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChecklistRow, parseChecklistRows } from '../src/migration/checklist-parser';
import { parseChecklistWorkbook } from '../src/migration/checklist-workbook';

/** DoD EP-MIGRATE (T-H11): парсинг клиентского чеклист-шаблона. Чистые + реальный файл. */
describe('parseChecklistRow (13 колонок)', () => {
  const full = [
    'AC-03',
    'Access Control',
    'Least privilege',
    'Is access least-privilege?',
    'Yes, RBAC enforced',
    'IAM export',
    'Partially Compliant',
    'High',
    'Some stale accounts',
    'Quarterly review',
    'IT Lead',
    '2026-09-01',
    'In Progress',
  ];

  it('маппит все поля + нормализует enum', () => {
    const r = parseChecklistRow(full)!;
    expect(r.ref).toBe('AC-03');
    expect(r.domain).toBe('Access Control');
    expect(r.complianceStatus).toBe('partially_compliant');
    expect(r.riskRating).toBe('high');
    expect(r.remediationStatus).toBe('in_progress');
    expect(r.owner).toBe('IT Lead');
  });

  it('Non-Compliant / Critical / Not Started', () => {
    const r = parseChecklistRow([
      'X-1',
      'D',
      '',
      '',
      '',
      '',
      'Non-Compliant',
      'Critical',
      '',
      '',
      '',
      '',
      'Not Started',
    ])!;
    expect(r.complianceStatus).toBe('non_compliant');
    expect(r.riskRating).toBe('critical');
    expect(r.remediationStatus).toBe('not_started');
  });

  it('N/A risk → null; пустой Ref → null (заголовок/пусто)', () => {
    expect(
      parseChecklistRow(['Y-1', '', '', '', '', '', 'Not Applicable', 'N/A', '', '', '', '', ''])!
        .riskRating,
    ).toBeNull();
    expect(parseChecklistRow([null, 'D'])).toBeNull();
    expect(parseChecklistRow(['', 'D'])).toBeNull();
  });

  it('parseChecklistRows пропускает заголовок «Ref» и пустые', () => {
    const rows = parseChecklistRows([
      ['Ref', 'Domain', 'Objective'],
      ['AC-01', 'AC', 'Obj', 'Q'],
      [null],
      ['CM-02', 'CM', 'Obj2', 'Q2'],
    ]);
    expect(rows.map((r) => r.ref)).toEqual(['AC-01', 'CM-02']);
  });
});

describe('parseChecklistWorkbook (реальный клиентский шаблон)', () => {
  it('парсит IT_Audit_Checklist_Template.xlsx в контроли', async () => {
    const file = join(
      __dirname,
      '../../../docs/client-templates/inbox/2026-07-18/IT_Audit_Checklist_Template.xlsx',
    );
    const buf = readFileSync(file);
    const rows = await parseChecklistWorkbook(buf);
    // спецификация: ~31 контрол-пример (GOV-01…SA-01)
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.every((r) => /^[A-Z]{2,4}-\d+/.test(r.ref))).toBe(true);
    expect(rows.some((r) => r.ref.startsWith('GOV'))).toBe(true);
  });
});
