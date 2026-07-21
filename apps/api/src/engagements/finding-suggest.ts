/**
 * Детерминированный assist findings (EP-AI buildable-срез, T-H15). БЕЗ LLM: гэп-детект —
 * пункт чеклиста с несоответствием и без finding → черновик-предложение. AI-слой
 * (генерация текста моделью) надстраивается поверх при снятии развилки по хостингу.
 */

export interface SuggestInputItem {
  checklistItemId: string;
  ref: string | null;
  question: string | null;
  responseText: string | null;
  complianceStatus: string | null;
  hasFinding: boolean;
  evidenceReferences: EvidenceReference[];
}

export interface EvidenceReference {
  documentId: string;
  filename: string;
  relation: string;
  location: string;
}

export interface FindingSuggestion {
  checklistItemId: string;
  ref: string | null;
  suggestedTitle: string;
  suggestedRisk: 'high' | 'medium';
  reason: string;
  expected: string;
  observed: string;
  confidence: number;
  evidenceReferences: EvidenceReference[];
  aiDraft: true;
  reviewRequired: true;
}

/** compliance → есть ли гэп + предлагаемый риск. */
const GAP_RISK: Record<string, 'high' | 'medium'> = {
  non_compliant: 'high',
  partially_compliant: 'medium',
};

/** Предложить черновики findings для несоответствующих пунктов без finding. */
export function suggestFindings(items: SuggestInputItem[]): FindingSuggestion[] {
  const out: FindingSuggestion[] = [];
  for (const it of items) {
    if (it.hasFinding) continue;
    const risk = it.complianceStatus ? GAP_RISK[it.complianceStatus] : undefined;
    if (!risk) continue;
    const q = it.question?.trim();
    const expected = q ? `Control requirement: ${q}` : 'Control requirement should be met';
    const observed = it.responseText?.trim()
      ? `Auditee response (${it.complianceStatus}): ${it.responseText.trim()}`
      : `Auditee marked the control as ${it.complianceStatus}`;
    out.push({
      checklistItemId: it.checklistItemId,
      ref: it.ref,
      suggestedTitle: `${it.ref ? `${it.ref}: ` : ''}${q ? `Gap — ${q}` : 'Обнаружен gap'}`,
      suggestedRisk: risk,
      reason: `Ответ «${it.complianceStatus}», finding отсутствует`,
      expected,
      observed,
      confidence: it.evidenceReferences.length > 0 ? 0.82 : 0.64,
      evidenceReferences: it.evidenceReferences,
      aiDraft: true,
      reviewRequired: true,
    });
  }
  return out;
}
