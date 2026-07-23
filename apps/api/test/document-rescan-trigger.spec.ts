import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_LINKABLE_ENTITY_TYPES,
  documentIntakeBucket,
  evidenceRescanQueueAuditPayload,
  evidenceRescanTriggerForDocument,
  extractSearchableDocumentText,
  supportedDocumentIntakeFormats,
} from '../src/documents/documents.service';
import { auditEvidenceHitsForQuery, parseAuditQuery } from '../src/search/search.service';

describe('document evidence re-scan triggers', () => {
  it('allows knowledge-base entries as attachment targets', () => {
    expect(DOCUMENT_LINKABLE_ENTITY_TYPES).toContain('kb_entry');
  });

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

  it('indexes safe text evidence immediately for DAT-04 document search', () => {
    const extraction = extractSearchableDocumentText({
      originalName: 'backup-control-log.txt',
      mime: 'text/plain',
      buffer: Buffer.from('Nightly backup completed successfully for production database.'),
    });

    expect(extraction).toMatchObject({
      extractionStatus: 'indexed',
      reason: 'text_inline',
      truncated: false,
    });
    expect(extraction.extractedText).toContain('Nightly backup');
    expect(extraction.extractedChars).toBeGreaterThan(20);
  });

  it('keeps binary Office/PDF evidence pending for the extraction pipeline instead of faking OCR', () => {
    const extraction = extractSearchableDocumentText({
      originalName: 'signed-policy.pdf',
      mime: 'application/pdf',
      buffer: Buffer.from('%PDF-binary'),
    });

    expect(extraction).toEqual({
      extractedText: null,
      extractionStatus: 'pending',
      extractedChars: 0,
      truncated: false,
      reason: 'binary_pipeline_pending',
    });
  });

  it('lets conversational evidence lookup match indexed document content', () => {
    const hits = auditEvidenceHitsForQuery(
      [
        {
          id: 'doc-1',
          filename: 'evidence.txt',
          mime: 'text/plain',
          status: 'active',
          category: 'evidence',
          extractedText: 'Privileged access review and backup restore proof for Q3.',
          extractionStatus: 'indexed',
          entityType: 'control',
          entityId: 'ctrl-1',
          relation: 'evidence',
          reviewStatus: 'ready',
        },
      ],
      parseAuditQuery('backup restore proof'),
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: 'doc-1',
      extractionStatus: 'indexed',
      reason: expect.stringContaining('content indexed'),
    });
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
