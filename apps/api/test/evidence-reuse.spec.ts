import { describe, expect, it } from 'vitest';
import { summarizeEvidenceReuse } from '../src/frameworks/evidence-reuse';

describe('cross-framework evidence reuse', () => {
  it('counts one control evidence document across multiple mapped frameworks and requirements', () => {
    const summary = summarizeEvidenceReuse(
      [
        {
          id: 'control-gov-01',
          originControlId: null,
          ref: 'GOV-01',
          requirementIds: ['iso-a-5-1', 'cobit-edm01'],
          frameworkIds: ['iso', 'cobit'],
        },
        {
          id: 'control-am-01',
          originControlId: null,
          ref: 'AM-01',
          requirementIds: ['nist-id-am'],
          frameworkIds: ['nist'],
        },
      ],
      [
        {
          documentId: 'doc-policy',
          filename: 'policy-pack.pdf',
          entityId: 'control-gov-01',
          relation: 'evidence',
          reviewStatus: 'accepted',
        },
        {
          documentId: 'doc-inventory',
          filename: 'asset-inventory.xlsx',
          entityId: 'control-am-01',
          relation: 'permanent_file',
          reviewStatus: 'ready',
        },
      ],
      4,
    );

    expect(summary).toMatchObject({
      evidenceDocuments: 2,
      reusableEvidenceDocuments: 1,
      coveredRequirementsWithEvidence: 3,
      evidenceCoveragePercent: 75,
    });
    expect(summary.topDocuments[0]).toMatchObject({
      documentId: 'doc-policy',
      filename: 'policy-pack.pdf',
      frameworks: 2,
      requirements: 2,
      controls: ['GOV-01'],
      reviewStatuses: ['accepted'],
      relations: ['evidence'],
    });
  });

  it('inherits evidence linked to an origin control for a tenant-adapted control', () => {
    const summary = summarizeEvidenceReuse(
      [
        {
          id: 'tenant-gov-01',
          originControlId: 'global-gov-01',
          ref: 'GOV-01',
          requirementIds: ['iso-a-5-1', 'cbar-1'],
          frameworkIds: ['iso', 'cbar'],
        },
      ],
      [
        {
          documentId: 'doc-global-policy',
          filename: 'global-policy.pdf',
          entityId: 'global-gov-01',
          relation: 'evidence',
          reviewStatus: 'accepted',
        },
      ],
      2,
    );

    expect(summary.reusableEvidenceDocuments).toBe(1);
    expect(summary.coveredRequirementsWithEvidence).toBe(2);
    expect(summary.topDocuments[0]?.controls).toEqual(['GOV-01']);
  });
});
