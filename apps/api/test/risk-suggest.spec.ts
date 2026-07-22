import { describe, expect, it } from 'vitest';
import {
  annotateRiskSuggestionDedupe,
  suggestBusinessRisks,
  type ExistingRiskForDedupe,
  type RiskSuggestionInput,
} from '../src/risks/risk-suggest';

const item = (o: Partial<RiskSuggestionInput>): RiskSuggestionInput => ({
  findingId: 'f1',
  titleI18n: {
    en: 'Backup restoration is not tested',
    ru: 'Восстановление из резервной копии не тестируется',
    az: 'Backup bərpası test edilmir',
  },
  riskRating: 'high',
  status: 'identified',
  controlRef: 'BCK-01',
  domain: null,
  ...o,
});

describe('suggestBusinessRisks', () => {
  it('creates draft-only business-risk proposal with evidence reference', () => {
    const [s] = suggestBusinessRisks([item({})], 'en');
    expect(s!.source).toBe('deterministic');
    expect(s!.review.required).toBe(true);
    expect(s!.review.action).toBe('create_or_edit_risk');
    expect(s!.evidenceRef).toEqual({
      type: 'finding',
      id: 'f1',
      location: 'Finding linked to BCK-01',
    });
  });

  it('maps continuity keywords and high rating to high class', () => {
    const [s] = suggestBusinessRisks([item({})], 'en');
    expect(s!.category).toBe('continuity');
    expect(s!.inherentImpact).toBe(4);
    expect(s!.inherentLikelihood).toBe(4);
    expect(s!.riskClass).toBe('high');
  });

  it('uses requested locale for finding title', () => {
    const [s] = suggestBusinessRisks([item({})], 'ru');
    expect(s!.title).toContain('Восстановление');
  });

  it('drops closed findings', () => {
    expect(suggestBusinessRisks([item({ status: 'closed' })], 'en')).toEqual([]);
  });

  it('classifies business categories beyond IT-only risk', () => {
    const res = suggestBusinessRisks(
      [
        item({ findingId: 'reg', titleI18n: { en: 'PCI compliance evidence is missing' } }),
        item({ findingId: 'fin', titleI18n: { en: 'Invoice approval control failed' } }),
        item({ findingId: 'tp', titleI18n: { en: 'Vendor access review is overdue' } }),
      ],
      'en',
    );
    expect(res.map((r) => r.category)).toEqual(['regulatory', 'financial', 'third_party']);
  });

  it('marks AI proposals as possible duplicates of existing manual risks', () => {
    const [proposal] = suggestBusinessRisks([item({})], 'en');
    const existing: ExistingRiskForDedupe[] = [
      {
        id: 'risk-1',
        titleI18n: { en: 'Backup restoration is not tested' },
        category: 'continuity',
        domain: 'BCK-01',
        riskClass: 'high',
        status: 'open',
      },
    ];

    const [deduped] = annotateRiskSuggestionDedupe([proposal!], existing, 'en');

    expect(deduped!.dedupe).toMatchObject({
      status: 'possible_duplicate',
      matchedRiskId: 'risk-1',
      matchedTitle: 'Backup restoration is not tested',
      reason: 'same_title',
    });
    expect(deduped!.dedupe?.fingerprint).toContain('continuity:bck-01');
  });

  it('keeps closed matches out of the duplicate guard', () => {
    const [proposal] = suggestBusinessRisks([item({})], 'en');

    const [deduped] = annotateRiskSuggestionDedupe(
      [proposal!],
      [
        {
          id: 'closed-risk',
          titleI18n: { en: 'Business risk — Backup restoration is not tested' },
          category: 'continuity',
          domain: 'BCK-01',
          riskClass: 'high',
          status: 'closed',
        },
      ],
      'en',
    );

    expect(deduped!.dedupe).toMatchObject({
      status: 'new',
      matchedRiskId: null,
      reason: null,
    });
  });
});
