import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { classifyRisk, DEFAULT_THRESHOLDS } from './classify-risk';

export interface RiskSuggestionInput {
  findingId: string;
  titleI18n: I18nText;
  riskRating: string;
  status: string;
  controlRef: string | null;
  domain: string | null;
}

export interface ExistingRiskForDedupe {
  id: string;
  titleI18n: I18nText;
  category: string | null;
  domain: string | null;
  riskClass: string | null;
  status: string;
}

export interface RiskSuggestionDedupe {
  fingerprint: string;
  status: 'new' | 'possible_duplicate';
  matchedRiskId: string | null;
  matchedTitle: string | null;
  reason: 'same_title' | 'same_category_domain' | null;
}

export interface RiskSuggestion {
  source: 'deterministic';
  findingId: string;
  title: string;
  description: string;
  category:
    'operational' | 'financial' | 'regulatory' | 'third_party' | 'continuity' | 'reputational';
  affectedControlRef: string | null;
  domain: string | null;
  inherentImpact: number;
  inherentLikelihood: number;
  riskClass: string | null;
  confidence: number;
  evidenceRef: {
    type: 'finding';
    id: string;
    location: string;
  };
  review: {
    required: true;
    action: 'create_or_edit_risk';
  };
  dedupe?: RiskSuggestionDedupe;
}

const SCORE_BY_RATING: Record<string, { impact: number; likelihood: number; confidence: number }> =
  {
    critical: { impact: 5, likelihood: 5, confidence: 0.86 },
    high: { impact: 4, likelihood: 4, confidence: 0.8 },
    medium: { impact: 3, likelihood: 3, confidence: 0.72 },
    low: { impact: 2, likelihood: 2, confidence: 0.62 },
  };

function categoryOf(text: string, domain: string | null): RiskSuggestion['category'] {
  const s = `${text} ${domain ?? ''}`.toLowerCase();
  if (/(vendor|supplier|third.?party|outsourc|подряд|поставщик)/i.test(s)) return 'third_party';
  if (/(backup|restore|continuity|drp|bcp|availability|резерв|восстанов|непрерыв)/i.test(s)) {
    return 'continuity';
  }
  if (/(regulat|compliance|privacy|gdpr|cbar|iso|pci|nist|закон|регулятор|соответств)/i.test(s)) {
    return 'regulatory';
  }
  if (/(fraud|payment|invoice|financial|revenue|budget|штраф|финанс|платеж)/i.test(s)) {
    return 'financial';
  }
  if (/(reputation|customer|client|public|breach|утеч|клиент|репутац)/i.test(s)) {
    return 'reputational';
  }
  return 'operational';
}

const TITLE_PREFIX = /^business\s+risk\s*[—\-:]\s*/i;
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'not',
  'of',
  'or',
  'risk',
  'the',
  'to',
  'with',
]);

function normalizedText(text: string): string {
  return text
    .replace(TITLE_PREFIX, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .join(' ');
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizedText(text).split(/\s+/).filter(Boolean));
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;
  let hits = 0;
  for (const token of smaller) {
    if (larger.has(token)) hits += 1;
  }
  return hits / smaller.size;
}

function dedupeFingerprint(suggestion: RiskSuggestion): string {
  const scope = suggestion.domain ?? suggestion.affectedControlRef ?? 'unmapped';
  const titleTokens = [...tokenSet(suggestion.title)].sort().slice(0, 8).join('-') || 'untitled';
  return `${suggestion.category}:${scope.toLowerCase()}:${titleTokens}`;
}

export function annotateRiskSuggestionDedupe(
  suggestions: RiskSuggestion[],
  existingRisks: ExistingRiskForDedupe[],
  locale: Locale,
): RiskSuggestion[] {
  const candidates = existingRisks.filter((risk) => risk.status !== 'closed');
  return suggestions.map((suggestion) => {
    const suggestionTitle = normalizedText(suggestion.title);
    const suggestionTokens = tokenSet(suggestion.title);
    const scope = suggestion.domain ?? suggestion.affectedControlRef ?? null;
    let match: ExistingRiskForDedupe | undefined;
    let reason: RiskSuggestionDedupe['reason'] = null;

    for (const existing of candidates) {
      const existingTitle = resolveLocalized(existing.titleI18n, locale);
      const existingNormalized = normalizedText(existingTitle);
      if (suggestionTitle && suggestionTitle === existingNormalized) {
        match = existing;
        reason = 'same_title';
        break;
      }
      const sameCategory = existing.category === suggestion.category;
      const sameScope = scope !== null && existing.domain === scope;
      if (
        sameCategory &&
        sameScope &&
        overlapRatio(suggestionTokens, tokenSet(existingTitle)) >= 0.6
      ) {
        match = existing;
        reason = 'same_category_domain';
        break;
      }
    }

    return {
      ...suggestion,
      dedupe: {
        fingerprint: dedupeFingerprint(suggestion),
        status: match ? 'possible_duplicate' : 'new',
        matchedRiskId: match?.id ?? null,
        matchedTitle: match ? resolveLocalized(match.titleI18n, locale) : null,
        reason,
      },
    };
  });
}

/** Детерминированные business-risk предложения из открытых findings. */
export function suggestBusinessRisks(
  findings: RiskSuggestionInput[],
  locale: Locale,
): RiskSuggestion[] {
  return findings
    .filter((f) => f.status !== 'closed')
    .map((f) => {
      const findingTitle = resolveLocalized(f.titleI18n, locale);
      const score = SCORE_BY_RATING[f.riskRating] ?? SCORE_BY_RATING.medium!;
      const category = categoryOf(findingTitle, f.domain);
      const control = f.controlRef ? `control ${f.controlRef}` : 'the affected control';
      return {
        source: 'deterministic',
        findingId: f.findingId,
        title: `Business risk — ${findingTitle}`,
        description:
          `Potential ${category.replace('_', '-')} risk derived from finding “${findingTitle}”. ` +
          `Review the business impact, map it to ${control}, assign an owner and confirm treatment before adding it to the final risk register.`,
        category,
        affectedControlRef: f.controlRef,
        domain: f.domain,
        inherentImpact: score.impact,
        inherentLikelihood: score.likelihood,
        riskClass: classifyRisk(score.impact, score.likelihood, DEFAULT_THRESHOLDS),
        confidence: score.confidence,
        evidenceRef: {
          type: 'finding',
          id: f.findingId,
          location: f.controlRef ? `Finding linked to ${f.controlRef}` : 'Finding record',
        },
        review: {
          required: true,
          action: 'create_or_edit_risk',
        },
      };
    });
}
