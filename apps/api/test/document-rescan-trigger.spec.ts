import { describe, expect, it } from 'vitest';
import { evidenceRescanTriggerForDocument } from '../src/documents/documents.service';

describe('document evidence re-scan triggers', () => {
  it('queues linked active evidence for extraction and draft AI refresh', () => {
    const trigger = evidenceRescanTriggerForDocument(
      { filename: 'backup-evidence.pdf', mime: 'application/pdf', status: 'active' },
      [
        {
          entityType: 'engagement',
          entityId: 'eng-1',
          relation: 'evidence',
          reviewStatus: 'not_ready',
        },
      ],
    );

    expect(trigger).toMatchObject({
      required: true,
      reason: 'linked_evidence_upload',
      humanReviewGate: 'auditor_review_required',
      draftOnly: true,
      queues: {
        extraction: true,
        ocr: false,
        aiFindingDrafts: true,
        evidenceRequestFollowUp: false,
        reportReadinessRefresh: false,
      },
    });
    expect(trigger.impactedTargets).toHaveLength(1);
    expect(trigger.explanation).toContain('draft-only');
  });

  it('routes scans through OCR before AI refresh', () => {
    const trigger = evidenceRescanTriggerForDocument(
      { filename: 'server-room-photo.png', mime: 'image/png', status: 'active' },
      [{ entityType: 'control', relation: 'evidence', reviewStatus: 'ready' }],
    );

    expect(trigger.bucket).toBe('image_ocr');
    expect(trigger.queues.ocr).toBe(true);
    expect(trigger.queues.reportReadinessRefresh).toBe(true);
  });

  it('keeps unlinked uploads in follow-up instead of AI refresh', () => {
    const trigger = evidenceRescanTriggerForDocument(
      {
        filename: 'policy-draft.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        status: 'active',
      },
      [],
    );

    expect(trigger.reason).toBe('link_required');
    expect(trigger.queues.extraction).toBe(false);
    expect(trigger.queues.aiFindingDrafts).toBe(false);
    expect(trigger.queues.evidenceRequestFollowUp).toBe(true);
  });
});
