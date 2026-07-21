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
  TextRun,
  WidthType,
} from 'docx';
import type { ReportData, ReportFindingRow, ReportRiskRow } from './report-data.service';

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

const openFinding = (f: ReportFindingRow): boolean =>
  !['closed', 'remediated', 'resolved'].includes(f.status);

const countBy = <T>(
  rows: T[],
  key: (row: T) => string | null | undefined,
): Record<string, number> =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const k = key(row) || 'unclassified';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

const heatMapRows = (risks: ReportRiskRow[]): Array<{ className: string; count: number }> =>
  Object.entries(countBy(risks, (r) => r.riskClass)).map(([className, count]) => ({
    className,
    count,
  }));

const executiveRows = (data: ReportData): Array<{ metric: string; value: string }> => [
  { metric: 'Checklist controls', value: String(data.checklist.length) },
  { metric: 'Findings', value: String(data.findings.length) },
  { metric: 'Open findings', value: String(data.findings.filter(openFinding).length) },
  {
    metric: 'High/Critical findings',
    value: String(data.findings.filter((f) => ['high', 'critical'].includes(f.riskRating)).length),
  },
  { metric: 'Risks in register', value: String(data.risks.length) },
  {
    metric: 'High/Critical risks',
    value: String(
      data.risks.filter((r) => ['high', 'critical'].includes(r.riskClass ?? '')).length,
    ),
  },
];

/** CSV списка findings (REP-07): для Excel/Sheets. */
export function toCsv(data: ReportData): Buffer {
  let header: string[];
  let rows: string[][];
  if (data.deliverable === 'risk_matrix') {
    header = ['Risk', 'Category', 'Likelihood', 'Impact', 'Class', 'Treatment', 'Owner', 'Status'];
    rows = data.risks.map((r) => [
      r.title,
      r.category ?? '',
      r.inherentLikelihood?.toString() ?? '',
      r.inherentImpact?.toString() ?? '',
      r.riskClass ?? '',
      r.treatment ?? '',
      r.owner ?? '',
      r.status,
    ]);
  } else if (data.deliverable === 'action_plan') {
    header = ['Action', 'Why', 'Owner', 'Due date', 'Finding status', 'Risk'];
    rows = data.findings.map((f) => [
      f.recommendation ?? f.title,
      f.title,
      f.owner ?? '',
      f.dueDate ?? '',
      f.status,
      f.riskRating,
    ]);
  } else if (data.deliverable === 'executive_summary') {
    header = ['Metric', 'Value'];
    rows = executiveRows(data).map((r) => [r.metric, r.value]);
  } else {
    header = ['Title', 'Risk', 'Status', 'Owner', 'Auditor', 'Due date', 'Recommendation'];
    rows = data.findings.map((f) => [
      f.title,
      f.riskRating,
      f.status,
      f.owner ?? '',
      f.auditor ?? '',
      f.dueDate ?? '',
      f.recommendation ?? '',
    ]);
  }
  return Buffer.from(
    [header.join(','), ...rows.map((row) => row.map((c) => csvEscape(String(c))).join(','))].join(
      '\n',
    ) + '\n',
    'utf8',
  );
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
  lines.push('  <risks>');
  for (const r of data.risks) {
    lines.push('    <risk>');
    lines.push(`      <title>${xmlEscape(r.title)}</title>`);
    lines.push(`      <category>${xmlEscape(r.category ?? '')}</category>`);
    lines.push(`      <class>${xmlEscape(r.riskClass ?? '')}</class>`);
    lines.push(`      <likelihood>${xmlEscape(String(r.inherentLikelihood ?? ''))}</likelihood>`);
    lines.push(`      <impact>${xmlEscape(String(r.inherentImpact ?? ''))}</impact>`);
    lines.push(`      <owner>${xmlEscape(r.owner ?? '')}</owner>`);
    lines.push('    </risk>');
  }
  lines.push('  </risks>');
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
    { field: 'Deliverable', value: data.deliverableTitle },
    { field: 'Title', value: data.title },
    { field: 'Subsidiary', value: data.subsidiary ?? '' },
    { field: 'Audit type', value: data.auditType ?? '' },
    { field: 'Mode', value: data.mode },
    { field: 'State', value: data.state },
    { field: 'Period', value: [data.periodStart, data.periodEnd].filter(Boolean).join(' — ') },
    { field: 'Findings', value: data.findings.length },
    { field: 'Risks', value: data.risks.length },
    { field: 'Generated at', value: data.generatedAt },
  ]);
  summary.getRow(1).font = { bold: true };

  if (data.deliverable === 'audit_report') {
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
  }

  const findings = wb.addWorksheet(
    data.deliverable === 'action_plan'
      ? 'Action Plan'
      : data.deliverable === 'nonconformities'
        ? 'Non-Conformities'
        : 'Findings',
  );
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

  if (['audit_report', 'risk_matrix', 'executive_summary'].includes(data.deliverable)) {
    const risks = wb.addWorksheet('Risk Matrix');
    risks.columns = [
      { header: 'Risk', key: 'title', width: 42 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Likelihood', key: 'likelihood', width: 12 },
      { header: 'Impact', key: 'impact', width: 10 },
      { header: 'Class', key: 'className', width: 14 },
      { header: 'Treatment', key: 'treatment', width: 24 },
      { header: 'Owner', key: 'owner', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
    ];
    risks.addRows(
      data.risks.map((r) => ({
        title: r.title,
        category: r.category ?? '',
        likelihood: r.inherentLikelihood ?? '',
        impact: r.inherentImpact ?? '',
        className: r.riskClass ?? '',
        treatment: r.treatment ?? '',
        owner: r.owner ?? '',
        status: r.status,
      })),
    );
    risks.getRow(1).font = { bold: true };

    const heat = wb.addWorksheet('Risk Class Summary');
    heat.columns = [
      { header: 'Class', key: 'className', width: 18 },
      { header: 'Count', key: 'count', width: 10 },
    ];
    heat.addRows(heatMapRows(data.risks));
    heat.getRow(1).font = { bold: true };
  }

  if (data.deliverable === 'executive_summary') {
    const exec = wb.addWorksheet('Executive Metrics');
    exec.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    exec.addRows(executiveRows(data));
    exec.getRow(1).font = { bold: true };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Word .docx (REP-07). */
export async function toDocx(data: ReportData): Promise<Buffer> {
  const cell = (text: string, bold = false): TableCell =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });

  const findingsTable = (): Table =>
    new Table({
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

  const risksTable = (): Table =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ['Risk', 'Category', 'Likelihood', 'Impact', 'Class'].map((h) => cell(h, true)),
        }),
        ...data.risks.map(
          (r) =>
            new TableRow({
              children: [
                r.title,
                r.category ?? '',
                r.inherentLikelihood ?? '',
                r.inherentImpact ?? '',
                r.riskClass ?? '',
              ].map((c) => cell(String(c))),
            }),
        ),
      ],
    });

  const base = [
    new Paragraph({ text: data.deliverableTitle, heading: HeadingLevel.HEADING_1 }),
    new Paragraph(data.title),
    new Paragraph(`Subsidiary: ${data.subsidiary ?? '—'}`),
    new Paragraph(
      `Audit type: ${data.auditType ?? '—'}    Mode: ${data.mode}    State: ${data.state}`,
    ),
    new Paragraph(`Generated at: ${data.generatedAt}`),
  ];
  const children =
    data.deliverable === 'risk_matrix'
      ? [
          ...base,
          new Paragraph({ text: 'Risk Matrix', heading: HeadingLevel.HEADING_2 }),
          risksTable(),
        ]
      : data.deliverable === 'executive_summary'
        ? [
            ...base,
            new Paragraph({ text: 'Key metrics', heading: HeadingLevel.HEADING_2 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: ['Metric', 'Value'].map((h) => cell(h, true)) }),
                ...executiveRows(data).map(
                  (r) => new TableRow({ children: [r.metric, r.value].map((c) => cell(c)) }),
                ),
              ],
            }),
          ]
        : [
            ...base,
            new Paragraph({
              text: data.deliverable === 'action_plan' ? 'Action Plan' : 'Findings',
              heading: HeadingLevel.HEADING_2,
            }),
            findingsTable(),
          ];

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function renderPdfHeader(doc: PDFKit.PDFDocument, data: ReportData): void {
  doc.font('bold').fontSize(18).text(data.deliverableTitle);
  doc.moveDown(0.3);
  doc.font('bold').fontSize(13).text(data.title);
  doc.moveDown(0.5);
  doc.font('body').fontSize(10);
  doc.text(`Subsidiary: ${data.subsidiary ?? '—'}`);
  doc.text(`Audit type: ${data.auditType ?? '—'}   Mode: ${data.mode}   State: ${data.state}`);
  if (data.periodStart || data.periodEnd) {
    doc.text(`Period: ${[data.periodStart, data.periodEnd].filter(Boolean).join(' — ')}`);
  }
  doc.text(`Generated at: ${data.generatedAt}`);
}

function renderPdfFindings(doc: PDFKit.PDFDocument, data: ReportData, title = 'Findings'): void {
  doc.moveDown().font('bold').fontSize(14).text(title);
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
}

function renderPdfRisks(doc: PDFKit.PDFDocument, data: ReportData): void {
  doc.moveDown().font('bold').fontSize(14).text('Risk Matrix');
  doc.moveDown(0.3).font('body').fontSize(10);
  if (data.risks.length === 0) {
    doc.text('No risks in register.');
  } else {
    for (const r of data.risks) {
      doc.font('bold').text(`${r.title} [${r.riskClass ?? 'unclassified'}]`);
      doc
        .font('body')
        .text(
          `Category: ${r.category ?? '—'}   L×I: ${r.inherentLikelihood ?? '—'}×${r.inherentImpact ?? '—'}   Owner: ${r.owner ?? '—'}`,
        );
      if (r.treatment) doc.text(`Treatment: ${r.treatment}`);
      doc.moveDown(0.4);
    }
  }
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

      renderPdfHeader(doc, data);

      if (data.deliverable === 'risk_matrix') {
        renderPdfRisks(doc, data);
      } else if (data.deliverable === 'executive_summary') {
        doc.moveDown().font('bold').fontSize(14).text('Key metrics');
        doc.moveDown(0.3).font('body').fontSize(10);
        for (const row of executiveRows(data)) doc.text(`${row.metric}: ${row.value}`);
        renderPdfFindings(doc, data, 'Priority findings');
        renderPdfRisks(doc, data);
      } else {
        renderPdfFindings(
          doc,
          data,
          data.deliverable === 'action_plan' ? 'Action Plan' : 'Findings',
        );
      }

      if (data.deliverable === 'audit_report') {
        renderPdfRisks(doc, data);
        doc.moveDown().font('bold').fontSize(14).text('Checklist');
        doc.moveDown(0.3).font('body').fontSize(9);
        for (const c of data.checklist) {
          doc.font('bold').text(`${c.ref}. `, { continued: true }).font('body').text(c.question);
          if (c.answer) doc.text(`   Answer: ${c.answer} [${c.compliance ?? '—'}]`);
          doc.moveDown(0.2);
        }
      }

      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
