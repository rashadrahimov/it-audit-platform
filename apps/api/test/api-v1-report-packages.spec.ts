import { describe, expect, it, vi } from 'vitest';
import { ApiV1Controller } from '../src/api-v1/api-v1.controller';
import type { DbService } from '../src/db/db.service';
import type { ReportDataService } from '../src/reports/report-data.service';
import type { ApiKeyRequest } from '../src/api-keys/api-key.guard';

const queryRows = [
  {
    id: 'eng-1',
    titleI18n: { en: 'Access review audit' },
    state: 'report_issued',
    mode: 'formal',
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2026-03-31T00:00:00.000Z'),
  },
];

function fakeDbService(): DbService {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(queryRows)),
  };
  return {
    withTenant: vi.fn((_tenantId: string, cb: (tx: { select: () => typeof chain }) => unknown) =>
      cb({ select: () => chain }),
    ),
  } as unknown as DbService;
}

function fakeReportDataService(): ReportDataService {
  return {
    readiness: vi.fn(async () => ({
      engagementId: 'eng-1',
      title: 'Access review audit',
      subsidiary: 'Demo Bank',
      auditType: 'IT audit',
      state: 'report_issued',
      generatedAt: '2026-07-22T00:00:00.000Z',
      score: 83,
      ready: true,
      checklistTotal: 32,
      answered: 32,
      findings: 4,
      findingsOpen: 2,
      highRiskFindings: 1,
      risks: 7,
      evidenceLinks: 9,
      checks: [{ key: 'evidence', passed: true }],
    })),
  } as unknown as ReportDataService;
}

describe('API v1 report packages', () => {
  it('advertises report-packages in the public API index', () => {
    const controller = new ApiV1Controller(fakeDbService(), fakeReportDataService());

    expect(controller.index().resources).toContain('/api/v1/report-packages');
  });

  it('returns readiness and standard deliverable manifest metadata', async () => {
    const db = fakeDbService();
    const reportData = fakeReportDataService();
    const controller = new ApiV1Controller(db, reportData);
    const req = { tenantId: 'tenant-1' } as ApiKeyRequest;

    const rows = await controller.reportPackages(req);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      engagementId: 'eng-1',
      title: 'Access review audit',
      readiness: {
        score: 83,
        ready: true,
        checklistTotal: 32,
        answered: 32,
        findings: 4,
        risks: 7,
        evidenceLinks: 9,
      },
      package: {
        totalFiles: 15,
        supportedLocales: ['en', 'az', 'ru'],
        evidenceGrounded: true,
        humanReviewRequired: true,
      },
    });
    expect(rows[0]?.package.formats.map((format) => format.key)).toEqual(['pdf', 'docx', 'xlsx']);
    expect(rows[0]?.package.deliverables.map((deliverable) => deliverable.key)).toEqual([
      'audit_report',
      'nonconformities',
      'risk_matrix',
      'action_plan',
      'executive_summary',
    ]);
    expect(reportData.readiness).toHaveBeenCalledWith('tenant-1', 'eng-1', 'en');
  });
});
