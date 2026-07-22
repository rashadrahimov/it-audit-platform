import { describe, expect, it } from 'vitest';
import { buildReportPackageManifest, type ReportData } from '../src/reports/report-data.service';
import { toCsv } from '../src/reports/report-renderers';

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

    expect(csv.split('\n')[0]).toBe('Tədbir,Səbəb,Sahib,Son tarix,Status,Risk');
    expect(csv).not.toContain('Action,Why,Owner,Due date');
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
});
