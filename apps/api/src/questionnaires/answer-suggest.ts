/**
 * T-V42: детерминированный auto-suggest ответов из KB БЕЗ LLM.
 * Матчинг вопрос→KB по пересечению значимых токенов (Jaccard). Чистая функция —
 * вынесена для unit-теста и переиспользования (субстрат EP-AI).
 */

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'do',
  'does',
  'you',
  'your',
  'we',
  'our',
  'have',
  'has',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'how',
  'what',
  'which',
  'that',
  'this',
  'be',
  'can',
  'will',
  'any',
  'all',
  'please',
  'describe',
  'provide',
  'ли',
  'вы',
  'ваш',
  'ваша',
  'ваше',
  'как',
  'что',
  'есть',
  'для',
  'или',
  'и',
  'в',
  'на',
  'с',
]);

/** Значимые токены строки: lowercase, только слова длиной ≥3, без стоп-слов. */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-zа-я0-9]+/i)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return new Set(tokens);
}

export interface KbCandidate {
  id: string;
  question: string;
  answer: string;
}

export interface Suggestion {
  kbEntryId: string;
  kbQuestion: string;
  suggestedAnswer: string;
  score: number;
}

/**
 * Лучший KB-кандидат для вопроса по Jaccard-пересечению токенов.
 * Возвращает null, если совпадение ниже порога (нет осмысленного матча).
 */
export function suggestKbForQuestion(
  question: string,
  candidates: KbCandidate[],
  threshold = 0.15,
): Suggestion | null {
  const qTokens = tokenize(question);
  if (qTokens.size === 0) return null;
  let best: Suggestion | null = null;
  for (const c of candidates) {
    const cTokens = tokenize(c.question);
    if (cTokens.size === 0) continue;
    let inter = 0;
    for (const t of qTokens) if (cTokens.has(t)) inter += 1;
    if (inter === 0) continue;
    const union = qTokens.size + cTokens.size - inter;
    const score = inter / union;
    if (score >= threshold && (!best || score > best.score)) {
      best = {
        kbEntryId: c.id,
        kbQuestion: c.question,
        suggestedAnswer: c.answer,
        score: Math.round(score * 100) / 100,
      };
    }
  }
  return best;
}
