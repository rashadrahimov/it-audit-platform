import { describe, expect, it } from 'vitest';
import { suggestFindings } from '../src/engagements/finding-suggest';

describe('suggestFindings', () => {
  it('creates evidence-grounded draft findings for unresolved checklist gaps', () => {
    const suggestions = suggestFindings([
      {
        checklistItemId: 'item-1',
        ref: 'AC-01',
        question: 'Access reviews are performed quarterly',
        responseText: 'Reviews are ad-hoc and not documented.',
        complianceStatus: 'non_compliant',
        hasFinding: false,
        evidenceReferences: [
          {
            documentId: 'doc-1',
            filename: 'access-review.xlsx',
            relation: 'evidence',
            location: 'response for AC-01',
          },
        ],
      },
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      checklistItemId: 'item-1',
      suggestedRisk: 'high',
      confidence: 0.82,
      aiDraft: true,
      reviewRequired: true,
      expected: 'Control requirement: Access reviews are performed quarterly',
      observed: 'Auditee response (non_compliant): Reviews are ad-hoc and not documented.',
      controlClause: 'AC-01',
      riskJustification:
        'High risk because the control is marked non-compliant and can materially weaken the audit objective until remediated.',
      suggestedRecommendation:
        'Prioritize remediation for AC-01: assign an owner, close the observed gap, and retain evidence showing the control operates consistently (Access reviews are performed quarterly).',
      evidenceReferences: [{ filename: 'access-review.xlsx', location: 'response for AC-01' }],
    });
  });

  it('keeps low-confidence drafts when the gap has no document reference yet', () => {
    const suggestions = suggestFindings([
      {
        checklistItemId: 'item-2',
        ref: 'BC-02',
        question: 'Backups are tested',
        responseText: null,
        complianceStatus: 'partially_compliant',
        hasFinding: false,
        evidenceReferences: [],
      },
    ]);

    expect(suggestions[0]?.suggestedRisk).toBe('medium');
    expect(suggestions[0]?.confidence).toBe(0.64);
    expect(suggestions[0]?.suggestedRecommendation).toBe(
      'Create a remediation plan for BC-02: define compensating evidence or process improvements, assign an owner, and re-test operating effectiveness (Backups are tested).',
    );
    expect(suggestions[0]?.evidenceReferences).toEqual([]);
  });
});
