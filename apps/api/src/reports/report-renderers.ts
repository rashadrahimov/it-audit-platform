import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from 'docx';
import type { ReportData, ReportFindingRow } from './report-data.service';

/**
 * Рендереры отчёта в 5 форматов (T-045, REP-07). Все — чистый JS, без headless-
 * браузера (ADR-0002 on-prem single artifact). Кириллица/азербайджанская латиница —
 * встроенный DejaVu Sans (стандартные PDF-шрифты её не покрывают).
 */

/** Ищет шрифт рядом с собранным dist или в исходных assets. */
function fontPath(file: string): string {
  const candidates = [
    join(__dirname, '..', 'assets', 'fonts', file), // dist/assets/fonts
    join(__dirname, '..', '..', 'assets', 'fonts', file), // apps/api/assets/fonts (dev)
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Шрифт ${file} не найден: ${candidates.join(', ')}`);
  return found;
}

const csvEscape = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const xmlEscape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** CSV списка findings (REP-07): для Excel/Sheets. */
export function toCsv(data: ReportData): Buffer {
  const header = ['Title', 'Risk', 'Status', 'Owner', 'Auditor', 'Due date', 'Recommendation'];
  const rows = data.findings.map((f: ReportFindingRow) =>
    [
      f.title,
      f.riskRating,
      f.status,
      f.owner ?? '',
      f.auditor ?? '',
      f.dueDate ?? '',
      f.recommendation ?? '',
    ]
      .map((c) => csvEscape(String(c)))
      .join(','),
  );
  return Buffer.from([header.join(','), ...rows].join('\n') + '\n', 'utf8');
}

/** XML всего отчёта (REP-07): машиночитаемый обмен. */
export function toXml(data: ReportData): Buffer {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<engagementReport>'];
  lines.push(`  <title>${xmlEscape(data.title)}</title>`);
  lines.push(`  <subsidiary>${xmlEscape(data.subsidiary ?? '')}</subsidiary>`);
  lines.push(`  <auditType>${xmlEscape(data.auditType ?? '')}</auditType>`);
  lines.push(`  <mode>${xmlEscape(data.mode)}</mode>`);
  lines.push(`  <state>${xmlEscape(data.state)}</state>`);
  lines.push(`  <generatedAt>${xmlEscape(data.generatedAt)}</generatedAt>`);
  lines.push('  <findings>');
  for (const f of data.findings) {
    lines.push('    <finding>');
    lines.push(`      <title>${xmlEscape(f.title)}</title>`);
    lines.push(`      <risk>${xmlEscape(f.riskRating)}</risk>`);
    lines.push(`      <status>${xmlEscape(f.status)}</status>`);
    lines.push(`      <owner>${xmlEscape(f.owner ?? '')}</owner>`);
    lines.push(`      <dueDate>${xmlEscape(f.dueDate ?? '')}</dueDate>`);
    lines.push('    </finding>');
  }
  lines.push('  </findings>');
  lines.push('</engagementReport>');
  return Buffer.from(lines.join('\n') + '\n', 'utf8');
}

/** Excel (REP-07): листы Summary / Checklist / Findings. */
export async function toXlsx(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IT Audit Platform';

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 20 },
    { header: 'Value', key: 'value', width: 50 },
  ];
  summary.addRows([
    { field: 'Title', value: data.title },
    { field: 'Subsidiary', value: data.subsidiary ?? '' },
    { field: 'Audit type', value: data.auditType ?? '' },
    { field: 'Mode', value: data.mode },
    { field: 'State', value: data.state },
    { field: 'Period', value: [data.periodStart, data.periodEnd].filter(Boolean).join(' — ') },
    { field: 'Findings', value: data.findings.length },
    { field: 'Generated at', value: data.generatedAt },
  ]);
  summary.getRow(1).font = { bold: true };

  const checklist = wb.addWorksheet('Checklist');
  checklist.columns = [
    { header: 'Ref', key: 'ref', width: 12 },
    { header: 'Question', key: 'question', width: 60 },
    { header: 'Answer', key: 'answer', width: 50 },
    { header: 'Compliance', key: 'compliance', width: 20 },
  ];
  checklist.addRows(
    data.checklist.map((c) => ({
      ref: c.ref,
      question: c.question,
      answer: c.answer ?? '',
      compliance: c.compliance ?? '',
    })),
  );
  checklist.getRow(1).font = { bold: true };

  const findings = wb.addWorksheet('Findings');
  findings.columns = [
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Risk', key: 'risk', width: 12 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Owner', key: 'owner', width: 24 },
    { header: 'Auditor', key: 'auditor', width: 24 },
    { header: 'Due date', key: 'dueDate', width: 14 },
    { header: 'Recommendation', key: 'recommendation', width: 50 },
  ];
  findings.addRows(
    data.findings.map((f) => ({
      title: f.title,
      risk: f.riskRating,
      status: f.status,
      owner: f.owner ?? '',
      auditor: f.auditor ?? '',
      dueDate: f.dueDate ?? '',
      recommendation: f.recommendation ?? '',
    })),
  );
  findings.getRow(1).font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Word .docx (REP-07). */
export async function toDocx(data: ReportData): Promise<Buffer> {
  const cell = (text: string, bold = false): TableCell =>
    new TableCell({ children: [new Paragraph({ children: [{ text } as never], bold } as never)] });

  const findingsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ['Title', 'Risk', 'Status', 'Owner', 'Due date'].map((h) => cell(h, true)),
      }),
      ...data.findings.map(
        (f) =>
          new TableRow({
            children: [f.title, f.riskRating, f.status, f.owner ?? '', f.dueDate ?? ''].map((c) =>
              cell(String(c)),
            ),
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: data.title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph(`Subsidiary: ${data.subsidiary ?? '—'}`),
          new Paragraph(
            `Audit type: ${data.auditType ?? '—'}    Mode: ${data.mode}    State: ${data.state}`,
          ),
          new Paragraph(`Generated at: ${data.generatedAt}`),
          new Paragraph({ text: 'Findings', heading: HeadingLevel.HEADING_2 }),
          findingsTable,
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** PDF (REP-07): pdfkit + встроенный DejaVu (кириллица/AZ-латиница). */
export function toPdf(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.registerFont('body', fontPath('DejaVuSans.ttf'));
      doc.registerFont('bold', fontPath('DejaVuSans-Bold.ttf'));
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('bold').fontSize(18).text(data.title);
      doc.moveDown(0.5);
      doc.font('body').fontSize(10);
      doc.text(`Subsidiary: ${data.subsidiary ?? '—'}`);
      doc.text(`Audit type: ${data.auditType ?? '—'}   Mode: ${data.mode}   State: ${data.state}`);
      if (data.periodStart || data.periodEnd) {
        doc.text(`Period: ${[data.periodStart, data.periodEnd].filter(Boolean).join(' — ')}`);
      }
      doc.text(`Generated at: ${data.generatedAt}`);

      doc.moveDown().font('bold').fontSize(14).text('Findings');
      doc.moveDown(0.3).font('body').fontSize(10);
      if (data.findings.length === 0) {
        doc.text('No findings.');
      } else {
        for (const f of data.findings) {
          doc.font('bold').text(`${f.title} [${f.riskRating}]`);
          doc
            .font('body')
            .text(`Status: ${f.status}   Owner: ${f.owner ?? '—'}   Due: ${f.dueDate ?? '—'}`);
          if (f.recommendation) doc.text(`Recommendation: ${f.recommendation}`);
          doc.moveDown(0.4);
        }
      }

      doc.moveDown().font('bold').fontSize(14).text('Checklist');
      doc.moveDown(0.3).font('body').fontSize(9);
      for (const c of data.checklist) {
        doc.font('bold').text(`${c.ref}. `, { continued: true }).font('body').text(c.question);
        if (c.answer) doc.text(`   Answer: ${c.answer} [${c.compliance ?? '—'}]`);
        doc.moveDown(0.2);
      }

      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
