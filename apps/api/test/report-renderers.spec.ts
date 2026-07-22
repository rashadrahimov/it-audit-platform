import { describe, expect, it } from 'vitest';
import type { ReportData } from '../src/reports/report-data.service';
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
});
