import { describe, expect, it } from 'vitest';
import { suggestFindings, type SuggestInputItem } from '../src/engagements/finding-suggest';

/** DoD EP-AI assist-срез (T-H15): детерминированный гэп-детект. Чистая функция. */
const item = (o: Partial<SuggestInputItem>): SuggestInputItem => ({
  checklistItemId: 'i1',
  ref: 'AC-01',
  question: 'Least privilege?',
  complianceStatus: null,
  hasFinding: false,
  ...o,
});

describe('suggestFindings', () => {
  it('non_compliant без finding → предложение с риском high', () => {
    const [s] = suggestFindings([item({ complianceStatus: 'non_compliant' })]);
    expect(s!.suggestedRisk).toBe('high');
    expect(s!.suggestedTitle).toContain('AC-01');
    expect(s!.checklistItemId).toBe('i1');
  });

  it('partially_compliant без finding → medium', () => {
    const [s] = suggestFindings([item({ complianceStatus: 'partially_compliant' })]);
    expect(s!.suggestedRisk).toBe('medium');
  });

  it('compliant → нет предложения', () => {
    expect(suggestFindings([item({ complianceStatus: 'compliant' })])).toEqual([]);
  });

  it('несоответствие, но finding уже есть → нет предложения', () => {
    expect(
      suggestFindings([item({ complianceStatus: 'non_compliant', hasFinding: true })]),
    ).toEqual([]);
  });

  it('без ответа (null) → нет предложения', () => {
    expect(suggestFindings([item({ complianceStatus: null })])).toEqual([]);
  });

  it('несколько пунктов — только гэпы без finding', () => {
    const res = suggestFindings([
      item({ checklistItemId: 'a', complianceStatus: 'non_compliant' }),
      item({ checklistItemId: 'b', complianceStatus: 'compliant' }),
      item({ checklistItemId: 'c', complianceStatus: 'partially_compliant', hasFinding: true }),
      item({ checklistItemId: 'd', complianceStatus: 'partially_compliant' }),
    ]);
    expect(res.map((r) => r.checklistItemId)).toEqual(['a', 'd']);
  });
});
