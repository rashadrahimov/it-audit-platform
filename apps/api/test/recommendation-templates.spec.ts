import { describe, expect, it } from 'vitest';
import { localizedRecommendationTemplates } from '../src/seed-data/recommendation-templates';

describe('reusable recommendation templates', () => {
  it('exposes action-plan-ready templates with timeline and human review metadata', () => {
    const templates = localizedRecommendationTemplates('en');

    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(templates[0]).toMatchObject({
      actionPlanReady: true,
      humanReviewRequired: true,
    });
    expect(templates.map((template) => template.controlClause)).toContain('ISO 27001 A.5.18');
    expect(templates.every((template) => template.suggestedDueDays > 0)).toBe(true);
  });

  it('localizes recommendation content', () => {
    const ru = localizedRecommendationTemplates('ru');

    expect(ru.find((template) => template.key === 'backup-restore')?.title).toContain('бэкапа');
  });
});
