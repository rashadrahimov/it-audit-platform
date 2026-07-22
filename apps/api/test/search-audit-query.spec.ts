import { describe, expect, it } from 'vitest';
import {
  auditEvidenceHitsForQuery,
  parseAuditQuery,
  type AuditQueryEvidenceCandidate,
} from '../src/search/search.service';

const evidenceRows: AuditQueryEvidenceCandidate[] = [
  {
    id: 'doc-backup',
    filename: 'backup-restore-test.pdf',
    status: 'active',
    category: 'evidence',
    mime: 'application/pdf',
    entityType: 'engagement',
    entityId: 'eng-1',
    relation: 'evidence',
    reviewStatus: 'accepted',
  },
  {
    id: 'doc-policy',
    filename: 'access-policy.docx',
    status: 'active',
    category: 'policy',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    entityType: 'control',
    entityId: 'ctrl-1',
    relation: 'permanent_file',
    reviewStatus: 'ready',
  },
];

describe('conversational audit query evidence matching', () => {
  it('returns evidence documents for topic/term-backed audit questions', () => {
    const hits = auditEvidenceHitsForQuery(evidenceRows, parseAuditQuery('backup evidence'));

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: 'doc-backup',
      filename: 'backup-restore-test.pdf',
      relation: 'evidence',
      reviewStatus: 'accepted',
    });
    expect(hits[0]?.reason).toContain('topic backup and recovery');
  });

  it('does not return every document for risk-only finding questions', () => {
    const hits = auditEvidenceHitsForQuery(evidenceRows, parseAuditQuery('high findings'));

    expect(hits).toEqual([]);
  });
});
