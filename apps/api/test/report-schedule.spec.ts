import { describe, expect, it } from 'vitest';
import {
  buildScheduledReportDeliveryPlan,
  nextDigestRunAtForSettings,
} from '../src/reports-export/reports-export.service';

const base = {
  emailEnabled: true,
  schedule: 'anytime' as const,
  timezone: 'UTC',
};

describe('scheduled report digest preview', () => {
  it('estimates the next monthly digest for the first day at 09:00 UTC', () => {
    expect(
      nextDigestRunAtForSettings(
        { ...base, digest: 'monthly' },
        new Date('2026-07-22T09:30:00.000Z'),
      ),
    ).toBe('2026-08-01T09:00:00.000Z');

    expect(
      nextDigestRunAtForSettings(
        { ...base, digest: 'monthly' },
        new Date('2026-08-01T08:30:00.000Z'),
      ),
    ).toBe('2026-08-01T09:00:00.000Z');
  });

  it('keeps weekly and disabled schedule behavior intact', () => {
    expect(
      nextDigestRunAtForSettings(
        { ...base, digest: 'weekly' },
        new Date('2026-07-22T09:30:00.000Z'),
      ),
    ).toBe('2026-07-27T09:00:00.000Z');
    expect(
      nextDigestRunAtForSettings(
        { ...base, emailEnabled: false, digest: 'monthly' },
        new Date('2026-07-22T09:30:00.000Z'),
      ),
    ).toBeNull();
  });

  it('exposes a machine-checkable scheduled report delivery plan', () => {
    const plan = buildScheduledReportDeliveryPlan({ ...base, digest: 'monthly' }, 3);

    expect(plan.enabled).toBe(true);
    expect(plan.selectedCadence).toBe('monthly');
    expect(plan.supportedCadences).toEqual(['weekly', 'monthly', 'daily', 'off']);
    expect(plan.package.deliverables).toEqual([
      'audit_report',
      'nonconformities',
      'risk_matrix',
      'action_plan',
      'executive_summary',
    ]);
    expect(plan.package.formats).toEqual(['pdf', 'docx', 'xlsx']);
    expect(plan.package.locales).toEqual(['en', 'az', 'ru']);
    expect(plan.package.totalFiles).toBe(15);
    expect(plan.email).toMatchObject({
      enabled: true,
      template: 'weekly-digest',
      recipientCount: 3,
      schedule: 'anytime',
      timezone: 'UTC',
    });
    expect(plan.automation).toMatchObject({
      queue: 'system',
      jobName: 'weekly-digest',
      manualTriggerPath: 'POST /jobs/weekly-digest',
      dailyWorkerEvaluatesCadence: true,
    });
  });
});
