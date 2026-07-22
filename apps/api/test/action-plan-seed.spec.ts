import { describe, expect, it } from 'vitest';
import {
  acceptedAiControlClause,
  legacyRecommendationTaskTitle,
  recommendationTaskTitle,
  suggestedDueDateForRisk,
} from '../src/tasks/action-plan-seed';

describe('action plan recommendation seeding helpers', () => {
  it('prefixes AI-accepted control clauses into remediation task titles', () => {
    const controlClause = acceptedAiControlClause({
      ai: {
        source: 'finding_suggestion',
        decision: 'accepted',
        controlClause: 'ISO 27001 A.5.15',
      },
    });

    expect(controlClause).toBe('ISO 27001 A.5.15');
    expect(
      recommendationTaskTitle({
        recommendation: 'Define and enforce access review evidence retention.',
        controlClause,
      }),
    ).toBe('[ISO 27001 A.5.15] Define and enforce access review evidence retention.');
  });

  it('keeps legacy titles available for duplicate detection', () => {
    expect(legacyRecommendationTaskTitle(' Rotate privileged passwords. ')).toBe(
      'Rotate privileged passwords.',
    );
  });

  it('uses risk-based target timelines when a finding has no explicit due date', () => {
    const base = new Date('2026-07-22T12:30:00.000Z');

    expect(suggestedDueDateForRisk('critical', base).toISOString()).toBe(
      '2026-08-05T00:00:00.000Z',
    );
    expect(suggestedDueDateForRisk('high', base).toISOString()).toBe('2026-08-21T00:00:00.000Z');
    expect(suggestedDueDateForRisk('medium', base).toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(suggestedDueDateForRisk('low', base).toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(suggestedDueDateForRisk('unknown', base).toISOString()).toBe('2026-09-20T00:00:00.000Z');
  });
});
