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
