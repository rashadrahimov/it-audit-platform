import { describe, expect, it } from 'vitest';
import {
  documentIntakeBucket,
  evidenceRescanQueueAuditPayload,
  evidenceRescanTriggerForDocument,
  supportedDocumentIntakeFormats,
} from '../src/documents/documents.service';

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

  it('builds an immutable audit payload for the continuous re-scan queue signal', () => {
    const trigger = evidenceRescanTriggerForDocument(
      { filename: 'firewall-config.yaml', mime: 'application/x-yaml', status: 'active' },
      [{ entityType: 'control', entityId: 'ctrl-1', relation: 'evidence', reviewStatus: 'ready' }],
    );
    const payload = evidenceRescanQueueAuditPayload('doc-1', trigger, 'document.uploaded');

    expect(payload).toMatchObject({
      sourceAction: 'document.uploaded',
      documentId: 'doc-1',
      queued: true,
      reason: 'linked_evidence_upload',
      bucket: 'config_logs',
      enabledQueues: ['extraction', 'aiFindingDrafts', 'reportReadinessRefresh'],
      humanReviewGate: 'auditor_review_required',
      draftOnly: true,
    });
    expect(payload.impactedTargets).toEqual([
      {
        entityType: 'control',
        entityId: 'ctrl-1',
        relation: 'evidence',
        reviewStatus: 'ready',
      },
    ]);
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

  it('documents the supported intake formats for AI analysis', () => {
    const contract = supportedDocumentIntakeFormats();

    expect(contract).toMatchObject({
      count: 4,
      evidenceGrounded: true,
      humanReviewRequired: true,
      draftOnly: true,
    });
    expect(contract.formats.map((format) => format.bucket)).toEqual([
      'office_pdf',
      'spreadsheet',
      'image_ocr',
      'config_logs',
    ]);
    expect(contract.formats.find((format) => format.bucket === 'image_ocr')).toMatchObject({
      requiresOcr: true,
      queues: ['extraction', 'ocr', 'aiFindingDrafts'],
    });
    expect(contract.formats.every((format) => format.canDraftFindings)).toBe(true);
  });

  it.each([
    ['audit-report.pdf', 'application/pdf', 'office_pdf'],
    [
      'access-policy.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'office_pdf',
    ],
    [
      'user-access.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'spreadsheet',
    ],
    ['risk-register.csv', 'text/csv', 'spreadsheet'],
    ['datacenter-photo.jpeg', 'image/jpeg', 'image_ocr'],
    ['firewall-config.yaml', 'application/x-yaml', 'config_logs'],
    ['auth-events.log', 'text/plain', 'config_logs'],
  ])('classifies %s into %s', (filename, mime, expected) => {
    expect(documentIntakeBucket(filename, mime)).toBe(expected);
  });
});
