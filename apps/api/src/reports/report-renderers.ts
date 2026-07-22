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

const LABELS = {
  en: {
    action: 'Action',
    actionPlan: 'Action Plan',
    answer: 'Answer',
    aiConfidence: 'AI confidence',
    aiEvidence: 'AI evidence',
    aiRationale: 'AI rationale',
    auditType: 'Audit type',
    auditor: 'Auditor',
    category: 'Category',
    checklist: 'Checklist',
    checklistControls: 'Checklist controls',
    className: 'Class',
    compliance: 'Compliance',
    deliverable: 'Deliverable',
    dueDate: 'Due date',
    field: 'Field',
    findings: 'Findings',
    generatedAt: 'Generated at',
    highCriticalFindings: 'High/Critical findings',
    highCriticalRisks: 'High/Critical risks',
    heatMap: 'Likelihood × Impact heat map',
    impact: 'Impact',
    keyMetrics: 'Key metrics',
    likelihood: 'Likelihood',
    metric: 'Metric',
    mode: 'Mode',
    noFindings: 'No findings.',
    noRisks: 'No risks in register.',
    nonConformities: 'Non-Conformities',
    openFindings: 'Open findings',
    owner: 'Owner',
    period: 'Period',
    priorityFindings: 'Priority findings',
    question: 'Question',
    recommendation: 'Recommendation',
    risk: 'Risk',
    riskJustification: 'Risk justification',
    riskMatrix: 'Risk Matrix',
    risks: 'Risks',
    riskClassSummary: 'Risk Class Summary',
    risksInRegister: 'Risks in register',
    state: 'State',
    status: 'Status',
    subsidiary: 'Subsidiary',
    summary: 'Summary',
    title: 'Title',
    treatment: 'Treatment',
    value: 'Value',
    why: 'Why',
    controlClause: 'Control clause',
  },
  az: {
    action: 'Tədbir',
    actionPlan: 'Tədbirlər planı',
    answer: 'Cavab',
    aiConfidence: 'İİ etibarı',
    aiEvidence: 'İİ sübutu',
    aiRationale: 'İİ əsaslandırması',
    auditType: 'Audit növü',
    auditor: 'Auditor',
    category: 'Kateqoriya',
    checklist: 'Çeklist',
    checklistControls: 'Çeklist kontrolları',
    className: 'Sinif',
    compliance: 'Uyğunluq',
    deliverable: 'Sənəd',
    dueDate: 'Son tarix',
    field: 'Sahə',
    findings: 'Tapıntılar',
    generatedAt: 'Yaradılma vaxtı',
    highCriticalFindings: 'Yüksək/Kritik tapıntılar',
    highCriticalRisks: 'Yüksək/Kritik risklər',
    heatMap: 'Ehtimal × təsir istilik xəritəsi',
    impact: 'Təsir',
    keyMetrics: 'Əsas metriklər',
    likelihood: 'Ehtimal',
    metric: 'Metrik',
    mode: 'Rejim',
    noFindings: 'Tapıntı yoxdur.',
    noRisks: 'Risk reyestrində risk yoxdur.',
    nonConformities: 'Uyğunsuzluqlar',
    openFindings: 'Açıq tapıntılar',
    owner: 'Sahib',
    period: 'Dövr',
    priorityFindings: 'Prioritet tapıntılar',
    question: 'Sual',
    recommendation: 'Tövsiyə',
    risk: 'Risk',
    riskJustification: 'Risk əsaslandırması',
    riskMatrix: 'Risk matrisi',
    risks: 'Risklər',
    riskClassSummary: 'Risk sinfi xülasəsi',
    risksInRegister: 'Reyestrdə risklər',
    state: 'Status',
    status: 'Status',
    subsidiary: 'Törəmə şirkət',
    summary: 'Xülasə',
    title: 'Başlıq',
    treatment: 'Tədbir yanaşması',
    value: 'Dəyər',
    why: 'Səbəb',
    controlClause: 'Kontrol maddəsi',
  },
  ru: {
    action: 'Действие',
    actionPlan: 'План действий',
    answer: 'Ответ',
    aiConfidence: 'Уверенность ИИ',
    aiEvidence: 'Доказательства ИИ',
    aiRationale: 'Обоснование ИИ',
    auditType: 'Тип аудита',
    auditor: 'Аудитор',
    category: 'Категория',
    checklist: 'Чеклист',
    checklistControls: 'Контроли чеклиста',
    className: 'Класс',
    compliance: 'Соответствие',
    deliverable: 'Документ',
    dueDate: 'Срок',
    field: 'Поле',
    findings: 'Замечания',
    generatedAt: 'Сформировано',
    highCriticalFindings: 'Высокие/критичные замечания',
    highCriticalRisks: 'Высокие/критичные риски',
    heatMap: 'Тепловая карта вероятность × влияние',
    impact: 'Влияние',
    keyMetrics: 'Ключевые метрики',
    likelihood: 'Вероятность',
    metric: 'Метрика',
    mode: 'Режим',
    noFindings: 'Замечаний нет.',
    noRisks: 'В реестре рисков нет записей.',
    nonConformities: 'Несоответствия',
    openFindings: 'Открытые замечания',
    owner: 'Владелец',
    period: 'Период',
    priorityFindings: 'Приоритетные замечания',
    question: 'Вопрос',
    recommendation: 'Рекомендация',
    risk: 'Риск',
    riskJustification: 'Обоснование риска',
    riskMatrix: 'Матрица рисков',
    risks: 'Риски',
    riskClassSummary: 'Сводка классов риска',
    risksInRegister: 'Риски в реестре',
    state: 'Статус',
    status: 'Статус',
    subsidiary: 'Дочерняя компания',
    summary: 'Сводка',
    title: 'Название',
    treatment: 'Обработка',
    value: 'Значение',
    why: 'Почему',
    controlClause: 'Пункт контроля',
  },
} as const;

type LabelKey = keyof (typeof LABELS)['en'];

const l = (data: ReportData, key: LabelKey): string => LABELS[data.locale][key];

const aiConfidence = (f: ReportFindingRow): string =>
  f.aiReview ? `${Math.round(f.aiReview.confidence * 100)}%` : '';

const aiEvidence = (f: ReportFindingRow): string =>
  f.aiReview?.evidenceReferences
    .map((ref) => `${ref.filename}${ref.location ? ` @ ${ref.location}` : ''}`)
    .join('; ') ?? '';

const aiRationale = (f: ReportFindingRow): string =>
  [f.aiReview?.reason, f.aiReview?.riskJustification].filter(Boolean).join(' / ');

const riskHeatMapGrid = (risks: ReportRiskRow[]): number[][] => {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
  for (const r of risks) {
    const likelihood = Number(r.inherentLikelihood);
    const impact = Number(r.inherentImpact);
    if (
      Number.isInteger(likelihood) &&
      Number.isInteger(impact) &&
      likelihood >= 1 &&
      likelihood <= 5 &&
      impact >= 1 &&
      impact <= 5
    ) {
      const row = grid[5 - likelihood];
      if (row) {
        row[impact - 1] = (row[impact - 1] ?? 0) + 1;
      }
    }
  }
  return grid;
};

const executiveRows = (data: ReportData): Array<{ metric: string; value: string }> => [
  { metric: l(data, 'checklistControls'), value: String(data.checklist.length) },
  { metric: l(data, 'findings'), value: String(data.findings.length) },
  { metric: l(data, 'openFindings'), value: String(data.findings.filter(openFinding).length) },
  {
    metric: l(data, 'highCriticalFindings'),
    value: String(data.findings.filter((f) => ['high', 'critical'].includes(f.riskRating)).length),
  },
  { metric: l(data, 'risksInRegister'), value: String(data.risks.length) },
  {
    metric: l(data, 'highCriticalRisks'),
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
    const grid = riskHeatMapGrid(data.risks);
    const heatHeader = [
      l(data, 'heatMap'),
      ...[1, 2, 3, 4, 5].map((impact) => `${l(data, 'impact')} ${impact}`),
    ];
    const heatRows = grid.map((counts, index) => [
      `${l(data, 'likelihood')} ${5 - index}`,
      ...counts.map(String),
    ]);
    header = [
      l(data, 'risk'),
      l(data, 'category'),
      l(data, 'likelihood'),
      l(data, 'impact'),
      l(data, 'className'),
      l(data, 'treatment'),
      l(data, 'owner'),
      l(data, 'status'),
    ];
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
    return Buffer.from(
      [
        heatHeader.join(','),
        ...heatRows.map((row) => row.map((c) => csvEscape(String(c))).join(',')),
        '',
        header.join(','),
        ...rows.map((row) => row.map((c) => csvEscape(String(c))).join(',')),
      ].join('\n') + '\n',
      'utf8',
    );
  } else if (data.deliverable === 'action_plan') {
    header = [
      l(data, 'action'),
      l(data, 'why'),
      l(data, 'owner'),
      l(data, 'dueDate'),
      l(data, 'status'),
      l(data, 'risk'),
      l(data, 'controlClause'),
      l(data, 'aiConfidence'),
      l(data, 'aiEvidence'),
    ];
    rows = data.findings.map((f) => [
      f.recommendation ?? f.title,
      f.title,
      f.owner ?? '',
      f.dueDate ?? '',
      f.status,
      f.riskRating,
      f.aiReview?.controlClause ?? '',
      aiConfidence(f),
      aiEvidence(f),
    ]);
  } else if (data.deliverable === 'executive_summary') {
    header = [l(data, 'metric'), l(data, 'value')];
    rows = executiveRows(data).map((r) => [r.metric, r.value]);
  } else {
    header = [
      l(data, 'title'),
      l(data, 'risk'),
      l(data, 'status'),
      l(data, 'owner'),
      l(data, 'auditor'),
      l(data, 'dueDate'),
      l(data, 'recommendation'),
      l(data, 'controlClause'),
      l(data, 'aiConfidence'),
      l(data, 'aiRationale'),
      l(data, 'aiEvidence'),
    ];
    rows = data.findings.map((f) => [
      f.title,
      f.riskRating,
      f.status,
      f.owner ?? '',
      f.auditor ?? '',
      f.dueDate ?? '',
      f.recommendation ?? '',
      f.aiReview?.controlClause ?? '',
      aiConfidence(f),
      aiRationale(f),
      aiEvidence(f),
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
    if (f.aiReview) {
      lines.push('      <aiReview>');
      lines.push(`        <confidence>${xmlEscape(aiConfidence(f))}</confidence>`);
      lines.push(`        <controlClause>${xmlEscape(f.aiReview.controlClause)}</controlClause>`);
      lines.push(`        <rationale>${xmlEscape(aiRationale(f))}</rationale>`);
      lines.push(`        <evidence>${xmlEscape(aiEvidence(f))}</evidence>`);
      lines.push('      </aiReview>');
    }
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

  const summary = wb.addWorksheet(l(data, 'summary'));
  summary.columns = [
    { header: l(data, 'field'), key: 'field', width: 20 },
    { header: l(data, 'value'), key: 'value', width: 50 },
  ];
  summary.addRows([
    { field: l(data, 'deliverable'), value: data.deliverableTitle },
    { field: l(data, 'title'), value: data.title },
    { field: l(data, 'subsidiary'), value: data.subsidiary ?? '' },
    { field: l(data, 'auditType'), value: data.auditType ?? '' },
    { field: l(data, 'mode'), value: data.mode },
    { field: l(data, 'state'), value: data.state },
    {
      field: l(data, 'period'),
      value: [data.periodStart, data.periodEnd].filter(Boolean).join(' — '),
    },
    { field: l(data, 'findings'), value: data.findings.length },
    { field: l(data, 'risks'), value: data.risks.length },
    { field: l(data, 'generatedAt'), value: data.generatedAt },
  ]);
  summary.getRow(1).font = { bold: true };

  if (data.deliverable === 'audit_report') {
    const checklist = wb.addWorksheet('Checklist');
    checklist.columns = [
      { header: 'Ref', key: 'ref', width: 12 },
      { header: l(data, 'question'), key: 'question', width: 60 },
      { header: l(data, 'answer'), key: 'answer', width: 50 },
      { header: l(data, 'compliance'), key: 'compliance', width: 20 },
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
      ? l(data, 'actionPlan')
      : data.deliverable === 'nonconformities'
        ? l(data, 'nonConformities')
        : l(data, 'findings'),
  );
  findings.columns = [
    { header: l(data, 'title'), key: 'title', width: 40 },
    { header: l(data, 'risk'), key: 'risk', width: 12 },
    { header: l(data, 'status'), key: 'status', width: 16 },
    { header: l(data, 'owner'), key: 'owner', width: 24 },
    { header: l(data, 'auditor'), key: 'auditor', width: 24 },
    { header: l(data, 'dueDate'), key: 'dueDate', width: 14 },
    { header: l(data, 'recommendation'), key: 'recommendation', width: 50 },
    { header: l(data, 'controlClause'), key: 'controlClause', width: 24 },
    { header: l(data, 'aiConfidence'), key: 'aiConfidence', width: 16 },
    { header: l(data, 'aiRationale'), key: 'aiRationale', width: 60 },
    { header: l(data, 'aiEvidence'), key: 'aiEvidence', width: 60 },
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
      controlClause: f.aiReview?.controlClause ?? '',
      aiConfidence: aiConfidence(f),
      aiRationale: aiRationale(f),
      aiEvidence: aiEvidence(f),
    })),
  );
  findings.getRow(1).font = { bold: true };

  if (['audit_report', 'risk_matrix', 'executive_summary'].includes(data.deliverable)) {
    const risks = wb.addWorksheet(l(data, 'riskMatrix'));
    risks.columns = [
      { header: l(data, 'risk'), key: 'title', width: 42 },
      { header: l(data, 'category'), key: 'category', width: 18 },
      { header: l(data, 'likelihood'), key: 'likelihood', width: 12 },
      { header: l(data, 'impact'), key: 'impact', width: 10 },
      { header: l(data, 'className'), key: 'className', width: 14 },
      { header: l(data, 'treatment'), key: 'treatment', width: 24 },
      { header: l(data, 'owner'), key: 'owner', width: 24 },
      { header: l(data, 'status'), key: 'status', width: 14 },
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

    const heatGrid = wb.addWorksheet(l(data, 'heatMap'));
    heatGrid.columns = [
      { header: l(data, 'likelihood'), key: 'likelihood', width: 18 },
      ...[1, 2, 3, 4, 5].map((impact) => ({
        header: `${l(data, 'impact')} ${impact}`,
        key: `impact${impact}`,
        width: 12,
      })),
    ];
    heatGrid.addRows(
      riskHeatMapGrid(data.risks).map((counts, index) => ({
        likelihood: `${l(data, 'likelihood')} ${5 - index}`,
        impact1: counts[0],
        impact2: counts[1],
        impact3: counts[2],
        impact4: counts[3],
        impact5: counts[4],
      })),
    );
    heatGrid.getRow(1).font = { bold: true };

    const heat = wb.addWorksheet(l(data, 'riskClassSummary'));
    heat.columns = [
      { header: l(data, 'className'), key: 'className', width: 18 },
      { header: l(data, 'value'), key: 'count', width: 10 },
    ];
    heat.addRows(heatMapRows(data.risks));
    heat.getRow(1).font = { bold: true };
  }

  if (data.deliverable === 'executive_summary') {
    const exec = wb.addWorksheet(l(data, 'keyMetrics'));
    exec.columns = [
      { header: l(data, 'metric'), key: 'metric', width: 30 },
      { header: l(data, 'value'), key: 'value', width: 20 },
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
          children: [
            l(data, 'title'),
            l(data, 'risk'),
            l(data, 'status'),
            l(data, 'owner'),
            l(data, 'dueDate'),
            l(data, 'controlClause'),
            l(data, 'aiConfidence'),
            l(data, 'aiEvidence'),
          ].map((h) => cell(h, true)),
        }),
        ...data.findings.map(
          (f) =>
            new TableRow({
              children: [
                f.title,
                f.riskRating,
                f.status,
                f.owner ?? '',
                f.dueDate ?? '',
                f.aiReview?.controlClause ?? '',
                aiConfidence(f),
                aiEvidence(f),
              ].map((c) => cell(String(c))),
            }),
        ),
      ],
    });

  const risksTable = (): Table =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            l(data, 'risk'),
            l(data, 'category'),
            l(data, 'likelihood'),
            l(data, 'impact'),
            l(data, 'className'),
          ].map((h) => cell(h, true)),
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

  const heatMapTable = (): Table =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            l(data, 'likelihood'),
            ...[1, 2, 3, 4, 5].map((impact) => `${l(data, 'impact')} ${impact}`),
          ].map((h) => cell(h, true)),
        }),
        ...riskHeatMapGrid(data.risks).map(
          (counts, index) =>
            new TableRow({
              children: [`${l(data, 'likelihood')} ${5 - index}`, ...counts.map(String)].map((c) =>
                cell(c),
              ),
            }),
        ),
      ],
    });

  const base = [
    new Paragraph({ text: data.deliverableTitle, heading: HeadingLevel.HEADING_1 }),
    new Paragraph(data.title),
    new Paragraph(`${l(data, 'subsidiary')}: ${data.subsidiary ?? '—'}`),
    new Paragraph(
      `${l(data, 'auditType')}: ${data.auditType ?? '—'}    ${l(data, 'mode')}: ${data.mode}    ${l(data, 'state')}: ${data.state}`,
    ),
    new Paragraph(`${l(data, 'generatedAt')}: ${data.generatedAt}`),
  ];
  const children =
    data.deliverable === 'risk_matrix'
      ? [
          ...base,
          new Paragraph({ text: l(data, 'heatMap'), heading: HeadingLevel.HEADING_2 }),
          heatMapTable(),
          new Paragraph({ text: l(data, 'riskMatrix'), heading: HeadingLevel.HEADING_2 }),
          risksTable(),
        ]
      : data.deliverable === 'executive_summary'
        ? [
            ...base,
            new Paragraph({ text: l(data, 'keyMetrics'), heading: HeadingLevel.HEADING_2 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [l(data, 'metric'), l(data, 'value')].map((h) => cell(h, true)),
                }),
                ...executiveRows(data).map(
                  (r) => new TableRow({ children: [r.metric, r.value].map((c) => cell(c)) }),
                ),
              ],
            }),
            new Paragraph({ text: l(data, 'heatMap'), heading: HeadingLevel.HEADING_2 }),
            heatMapTable(),
          ]
        : [
            ...base,
            new Paragraph({
              text:
                data.deliverable === 'action_plan' ? l(data, 'actionPlan') : l(data, 'findings'),
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
  doc.text(`${l(data, 'subsidiary')}: ${data.subsidiary ?? '—'}`);
  doc.text(
    `${l(data, 'auditType')}: ${data.auditType ?? '—'}   ${l(data, 'mode')}: ${data.mode}   ${l(data, 'state')}: ${data.state}`,
  );
  if (data.periodStart || data.periodEnd) {
    doc.text(
      `${l(data, 'period')}: ${[data.periodStart, data.periodEnd].filter(Boolean).join(' — ')}`,
    );
  }
  doc.text(`${l(data, 'generatedAt')}: ${data.generatedAt}`);
}

function renderPdfFindings(
  doc: PDFKit.PDFDocument,
  data: ReportData,
  title = l(data, 'findings'),
): void {
  doc.moveDown().font('bold').fontSize(14).text(title);
  doc.moveDown(0.3).font('body').fontSize(10);
  if (data.findings.length === 0) {
    doc.text(l(data, 'noFindings'));
  } else {
    for (const f of data.findings) {
      doc.font('bold').text(`${f.title} [${f.riskRating}]`);
      doc
        .font('body')
        .text(
          `${l(data, 'status')}: ${f.status}   ${l(data, 'owner')}: ${f.owner ?? '—'}   ${l(data, 'dueDate')}: ${f.dueDate ?? '—'}`,
        );
      if (f.recommendation) doc.text(`${l(data, 'recommendation')}: ${f.recommendation}`);
      if (f.aiReview) {
        doc.text(
          `${l(data, 'aiConfidence')}: ${aiConfidence(f)}   ${l(data, 'controlClause')}: ${f.aiReview.controlClause || '—'}`,
        );
        if (aiRationale(f)) doc.text(`${l(data, 'aiRationale')}: ${aiRationale(f)}`);
        if (aiEvidence(f)) doc.text(`${l(data, 'aiEvidence')}: ${aiEvidence(f)}`);
      }
      doc.moveDown(0.4);
    }
  }
}

function renderPdfRisks(doc: PDFKit.PDFDocument, data: ReportData): void {
  doc.moveDown().font('bold').fontSize(14).text(l(data, 'riskMatrix'));
  doc.moveDown(0.3).font('body').fontSize(10);
  const grid = riskHeatMapGrid(data.risks);
  doc.font('bold').text(l(data, 'heatMap'));
  doc.font('body').text(['L\\I', ...[1, 2, 3, 4, 5].map((impact) => `${impact}`)].join('  '));
  for (const [index, counts] of grid.entries()) {
    doc.text([String(5 - index), ...counts.map(String)].join('    '));
  }
  doc.moveDown(0.4);
  if (data.risks.length === 0) {
    doc.text(l(data, 'noRisks'));
  } else {
    for (const r of data.risks) {
      doc.font('bold').text(`${r.title} [${r.riskClass ?? 'unclassified'}]`);
      doc
        .font('body')
        .text(
          `${l(data, 'category')}: ${r.category ?? '—'}   L×I: ${r.inherentLikelihood ?? '—'}×${r.inherentImpact ?? '—'}   ${l(data, 'owner')}: ${r.owner ?? '—'}`,
        );
      if (r.treatment) doc.text(`${l(data, 'treatment')}: ${r.treatment}`);
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
        doc.moveDown().font('bold').fontSize(14).text(l(data, 'keyMetrics'));
        doc.moveDown(0.3).font('body').fontSize(10);
        for (const row of executiveRows(data)) doc.text(`${row.metric}: ${row.value}`);
        renderPdfFindings(doc, data, l(data, 'priorityFindings'));
        renderPdfRisks(doc, data);
      } else {
        renderPdfFindings(
          doc,
          data,
          data.deliverable === 'action_plan' ? l(data, 'actionPlan') : l(data, 'findings'),
        );
      }

      if (data.deliverable === 'audit_report') {
        renderPdfRisks(doc, data);
        doc.moveDown().font('bold').fontSize(14).text(l(data, 'checklist'));
        doc.moveDown(0.3).font('body').fontSize(9);
        for (const c of data.checklist) {
          doc.font('bold').text(`${c.ref}. `, { continued: true }).font('body').text(c.question);
          if (c.answer) doc.text(`   ${l(data, 'answer')}: ${c.answer} [${c.compliance ?? '—'}]`);
          doc.moveDown(0.2);
        }
      }

      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
