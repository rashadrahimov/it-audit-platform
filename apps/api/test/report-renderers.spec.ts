import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  buildReportPackageManifest,
  REPORT_DELIVERABLES,
  REPORT_PACKAGE_FORMATS,
  type ReportData,
} from '../src/reports/report-data.service';
import { toCsv, toDocx, toPdf, toXlsx } from '../src/reports/report-renderers';

const baseReport = (patch: Partial<ReportData> = {}): ReportData => ({
  locale: 'en',
  deliverable: 'audit_report',
  deliverableTitle: 'Audit Report',
  title: 'Access audit',
  subsidiary: 'Demo Bank',
  auditType: 'IT audit',
  mode: 'full',
  state: 'reporting',
  periodStart: '2026-01-01',
  periodEnd: '2026-03-31',
  checklist: [
    { ref: 'AC-01', question: 'MFA enabled?', answer: 'No', compliance: 'non_compliant' },
  ],
  findings: [
    {
      title: 'MFA is not enforced',
      riskRating: 'high',
      status: 'open',
      owner: 'Control Owner',
      auditor: 'Lead Auditor',
      dueDate: '2026-08-01',
      recommendation: 'Enable MFA for privileged users.',
      aiReview: {
        confidence: 0.82,
        expected: 'Privileged access requires MFA.',
        observed: 'Admin account had no MFA evidence.',
        reason: 'The source evidence shows a privileged account without MFA enforcement.',
        controlClause: 'ISO 27001 A.5.15',
        riskJustification: 'Unauthorized access risk remains high until MFA evidence is attached.',
        evidenceReferences: [
          {
            documentId: 'doc-1',
            filename: 'access-review.xlsx',
            relation: 'source_document',
            location: 'AC-01 row 4',
          },
        ],
      },
    },
  ],
  risks: [
    {
      title: 'Unauthorized access',
      category: 'operational',
      status: 'identified',
      inherentImpact: 4,
      inherentLikelihood: 3,
      riskClass: 'high',
      treatment: 'mitigate',
      owner: 'Risk Owner',
    },
  ],
  generatedAt: '2026-07-22T00:00:00.000Z',
  ...patch,
});

describe('report renderers localization', () => {
  it('localizes action plan CSV headers in Azerbaijani', () => {
    const csv = toCsv(
      baseReport({
        locale: 'az',
        deliverable: 'action_plan',
        deliverableTitle: 'Tədbirlər planı',
      }),
    ).toString('utf8');

    expect(csv.split('\n')[0]).toBe(
      'Tədbir,Səbəb,Sahib,Son tarix,Status,Risk,Kontrol maddəsi,İİ etibarı,İİ sübutu',
    );
    expect(csv).not.toContain('Action,Why,Owner,Due date');
  });

  it('keeps accepted AI finding traceability in finding exports', () => {
    const csv = toCsv(baseReport()).toString('utf8');

    expect(csv.split('\n')[0]).toContain('Control clause,AI confidence,AI rationale,AI evidence');
    expect(csv).toContain('ISO 27001 A.5.15');
    expect(csv).toContain('82%');
    expect(csv).toContain('access-review.xlsx @ AC-01 row 4');
    expect(csv).toContain('Unauthorized access risk remains high');
  });

  it('localizes executive summary metrics in Russian', () => {
    const csv = toCsv(
      baseReport({
        locale: 'ru',
        deliverable: 'executive_summary',
        deliverableTitle: 'Резюме для руководства',
      }),
    ).toString('utf8');

    expect(csv).toContain('Метрика,Значение');
    expect(csv).toContain('Контроли чеклиста,1');
    expect(csv).toContain('Высокие/критичные риски,1');
    expect(csv).not.toContain('Checklist controls');
  });

  it('publishes a localized package manifest for all five deliverables and three formats', () => {
    const manifest = buildReportPackageManifest('019f882d-0c3f-7554-9e36-b6cba9fb56dc', 'az', {
      ready: false,
      score: 72,
      checks: [{ key: 'evidence', passed: false }],
    });

    expect(manifest).toMatchObject({
      locale: 'az',
      supportedLocales: ['en', 'az', 'ru'],
      totalFiles: 15,
      evidenceGrounded: true,
      humanReviewRequired: true,
      readinessGate: { ready: false, score: 72 },
    });
    expect(manifest.formats.map((format) => format.key)).toEqual(['pdf', 'docx', 'xlsx']);
    expect(manifest.deliverables.map((deliverable) => deliverable.key)).toEqual([
      'audit_report',
      'nonconformities',
      'risk_matrix',
      'action_plan',
      'executive_summary',
    ]);
    expect(manifest.deliverables[0]?.title).toBe('Audit hesabatı');
    expect(manifest.deliverables.every((deliverable) => deliverable.formats.length === 3)).toBe(
      true,
    );
  });

  it('renders valid PDF, Word and Excel files for every standard deliverable', async () => {
    for (const deliverable of REPORT_DELIVERABLES) {
      const report = baseReport({
        deliverable,
        deliverableTitle: `Test ${deliverable}`,
      });

      const pdf = await toPdf(report);
      expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');

      const docx = await toDocx(report);
      const docxZip = await JSZip.loadAsync(docx);
      expect(docxZip.file('word/document.xml')).toBeTruthy();

      const xlsx = await toXlsx(report);
      const xlsxZip = await JSZip.loadAsync(xlsx);
      expect(xlsxZip.file('xl/workbook.xml')).toBeTruthy();
    }
  });

  it('can package the five deliverables into the standard 15-file archive layout', async () => {
    const zip = new JSZip();
    zip.file(
      'package-manifest.json',
      JSON.stringify(
        buildReportPackageManifest('019f882d-0c3f-7554-9e36-b6cba9fb56dc', 'en', {
          ready: true,
          score: 100,
          checks: [],
        }),
      ),
    );

    for (const deliverable of REPORT_DELIVERABLES) {
      const report = baseReport({
        deliverable,
        deliverableTitle: `Test ${deliverable}`,
      });
      for (const format of REPORT_PACKAGE_FORMATS) {
        const body =
          format.key === 'pdf'
            ? await toPdf(report)
            : format.key === 'docx'
              ? await toDocx(report)
              : await toXlsx(report);
        zip.file(`${deliverable}/${deliverable}.${format.key}`, body);
      }
    }

    const archive = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
    const files = Object.keys(archive.files).filter((name) => !archive.files[name]?.dir);
    expect(files).toContain('package-manifest.json');
    expect(files.filter((name) => name.endsWith('.pdf')).length).toBe(5);
    expect(files.filter((name) => name.endsWith('.docx')).length).toBe(5);
    expect(files.filter((name) => name.endsWith('.xlsx')).length).toBe(5);
    expect(files.length).toBe(16);
  });
});
