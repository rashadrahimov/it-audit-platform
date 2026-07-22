import { describe, expect, it } from 'vitest';
import {
  auditEvidenceHitsForQuery,
  auditFindingHitsForQuery,
  explainAuditQuery,
  parseAuditQuery,
  suggestedAuditQueries,
  type AuditQueryEvidenceCandidate,
  type AuditQueryFindingCandidate,
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

const findingRows: AuditQueryFindingCandidate[] = [
  {
    id: 'finding-critical-access',
    titleI18n: { en: 'Privileged access review is overdue' },
    descriptionI18n: { en: 'Admin user access was not reviewed before the deadline.' },
    recommendationI18n: { en: 'Review privileged accounts and revoke excessive rights.' },
    riskRating: 'critical',
    status: 'identified',
    slaStatus: 'ok',
    dueDate: new Date('2026-01-15T00:00:00.000Z'),
    engagementId: 'eng-1',
    checklistRef: 'IAM-1',
    checklistQuestionI18n: { en: 'Is access reviewed periodically?' },
    controlRef: 'AC-01',
    controlObjectiveI18n: { en: 'Access control' },
  },
  {
    id: 'finding-low-backup',
    titleI18n: { en: 'Backup restore evidence is pending' },
    descriptionI18n: { en: 'The team has not attached recent restore evidence.' },
    recommendationI18n: { en: 'Attach restore test evidence.' },
    riskRating: 'low',
    status: 'identified',
    slaStatus: 'ok',
    dueDate: new Date('2026-09-15T00:00:00.000Z'),
    engagementId: 'eng-1',
    checklistRef: 'BCP-1',
    checklistQuestionI18n: { en: 'Are backups tested?' },
    controlRef: 'BC-01',
    controlObjectiveI18n: { en: 'Backup and recovery' },
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

describe('conversational audit query finding matching', () => {
  it('interprets overdue intent across English, Russian and Azerbaijani aliases', () => {
    expect(parseAuditQuery('overdue critical access findings')).toMatchObject({
      riskRating: 'critical',
      slaStatus: 'overdue',
      topic: 'access control',
    });
    expect(parseAuditQuery('просроченные критичные замечания по доступу')).toMatchObject({
      riskRating: 'critical',
      slaStatus: 'overdue',
      topic: 'access control',
    });
    expect(parseAuditQuery('gecikmiş kritik giriş qeydləri')).toMatchObject({
      riskRating: 'critical',
      slaStatus: 'overdue',
      topic: 'access control',
    });
  });

  it('returns only overdue findings that match risk and topic filters', () => {
    const hits = auditFindingHitsForQuery(
      findingRows,
      parseAuditQuery('show overdue critical access findings'),
      'en',
      new Date('2026-07-22T00:00:00.000Z'),
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: 'finding-critical-access',
      riskRating: 'critical',
      slaStatus: 'overdue',
      controlRef: 'AC-01',
      dueDate: '2026-01-15T00:00:00.000Z',
    });
    expect(hits[0]?.reason).toContain('SLA overdue');
    expect(hits[0]?.reason).toContain('due 2026-01-15');
  });

  it('does not let localized filler words block Azerbaijani overdue access queries', () => {
    const hits = auditFindingHitsForQuery(
      findingRows,
      parseAuditQuery('gecikmiş kritik giriş qeydləri'),
      'en',
      new Date('2026-07-22T00:00:00.000Z'),
    );

    expect(hits.map((hit) => hit.id)).toEqual(['finding-critical-access']);
  });

  it('explains deterministic intent parsing with confidence and examples', () => {
    const parsed = parseAuditQuery('show overdue critical access findings');
    const explanation = explainAuditQuery(parsed);

    expect(explanation).toMatchObject({
      confidenceLevel: 'high',
      deterministic: true,
      evidenceGroundedOnly: true,
    });
    expect(explanation.confidence).toBeGreaterThanOrEqual(0.8);
    expect(explanation.matchedSignals).toEqual([
      'risk:critical',
      'sla:overdue',
      'topic:access control',
    ]);
    expect(suggestedAuditQueries('ru')).toContain('просроченные критичные замечания по доступу');
  });
});
