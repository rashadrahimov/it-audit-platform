import { describe, expect, it } from 'vitest';
import { buildFindingFollowUpPlan } from '../src/findings/follow-up-plan';

describe('finding follow-up plan', () => {
  it('prioritizes overdue remediation and pending re-test work', () => {
    const plan = buildFindingFollowUpPlan(
      [
        {
          id: 'critical-overdue',
          title: 'Critical MFA gap',
          riskRating: 'critical',
          status: 'in_progress',
          slaStatus: 'overdue',
          dueDate: '2026-07-18T00:00:00.000Z',
          owner: 'Security Owner',
          auditor: 'Lead Auditor',
        },
        {
          id: 'pending-retest',
          title: 'Backup restore evidence',
          riskRating: 'high',
          status: 'pending_retest',
          slaStatus: 'ok',
          dueDate: '2026-07-25T00:00:00.000Z',
          owner: 'IT Owner',
          auditor: 'Lead Auditor',
        },
        {
          id: 'unassigned',
          title: 'Policy approval missing',
          riskRating: 'medium',
          status: 'identified',
          slaStatus: 'due_soon',
          dueDate: '2026-07-23T00:00:00.000Z',
          owner: null,
          auditor: null,
        },
        {
          id: 'closed',
          title: 'Closed item',
          riskRating: 'low',
          status: 'closed',
          slaStatus: 'ok',
          dueDate: null,
          owner: 'IT Owner',
          auditor: 'Lead Auditor',
        },
      ],
      new Date('2026-07-22T12:00:00.000Z'),
    );

    expect(plan.summary).toEqual({
      openFindings: 3,
      remediationQueue: 2,
      readyForRetest: 1,
      overdue: 1,
      dueSoon: 1,
      unassigned: 1,
    });
    expect(plan.lanes.remediation.map((item) => item.id)).toEqual([
      'critical-overdue',
      'unassigned',
    ]);
    expect(plan.lanes.remediation[0]).toMatchObject({
      nextAction: 'remediate_gap',
      daysPastDue: 4,
    });
    expect(plan.lanes.remediation[1]).toMatchObject({
      nextAction: 'assign_owner',
      daysUntilDue: 1,
    });
    expect(plan.lanes.retest[0]).toMatchObject({
      id: 'pending-retest',
      nextAction: 'auditor_retest',
      daysUntilDue: 3,
    });
  });
});
