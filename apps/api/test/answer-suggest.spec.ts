import { describe, expect, it } from 'vitest';
import {
  suggestKbForQuestion,
  tokenize,
  type KbCandidate,
} from '../src/questionnaires/answer-suggest';

/** T-V42: детерминированный auto-suggest ответов из KB (Jaccard-матчинг токенов, без LLM). */
const kb: KbCandidate[] = [
  { id: 'k1', question: 'Do you encrypt data at rest?', answer: 'Yes, AES-256 at rest.' },
  { id: 'k2', question: 'How do you manage access reviews?', answer: 'Quarterly UAR campaigns.' },
  { id: 'k3', question: 'What is your incident response process?', answer: 'Documented IR plan.' },
];

describe('tokenize', () => {
  it('drops stopwords and short tokens, lowercases', () => {
    const t = tokenize('Do you encrypt data at rest?');
    expect(t.has('encrypt')).toBe(true);
    expect(t.has('data')).toBe(true);
    expect(t.has('rest')).toBe(true);
    expect(t.has('you')).toBe(false); // stopword
    expect(t.has('do')).toBe(false); // short/stopword
  });
});

describe('suggestKbForQuestion', () => {
  it('matches a near-identical question to the right KB entry', () => {
    const s = suggestKbForQuestion('Do you encrypt data at rest?', kb);
    expect(s?.kbEntryId).toBe('k1');
    expect(s?.suggestedAnswer).toContain('AES-256');
    expect(s?.score).toBeGreaterThan(0.15);
  });

  it('matches paraphrased access-review question to k2', () => {
    const s = suggestKbForQuestion('Describe your access review management', kb);
    expect(s?.kbEntryId).toBe('k2');
  });

  it('returns null when no meaningful overlap', () => {
    expect(suggestKbForQuestion('What color is your logo?', kb)).toBeNull();
  });

  it('returns null for empty candidate set', () => {
    expect(suggestKbForQuestion('Do you encrypt data at rest?', [])).toBeNull();
  });

  it('picks the highest-scoring candidate', () => {
    const s = suggestKbForQuestion('incident response process documented?', kb);
    expect(s?.kbEntryId).toBe('k3');
  });
});
