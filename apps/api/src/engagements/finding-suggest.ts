/**
 * Детерминированный assist findings (EP-AI buildable-срез, T-H15). БЕЗ LLM: гэп-детект —
 * пункт чеклиста с несоответствием и без finding → черновик-предложение. AI-слой
 * (генерация текста моделью) надстраивается поверх при снятии развилки по хостингу.
 */

export interface SuggestInputItem {
  checklistItemId: string;
  ref: string | null;
  question: string | null;
  complianceStatus: string | null;
  hasFinding: boolean;
}

export interface FindingSuggestion {
  checklistItemId: string;
  ref: string | null;
  suggestedTitle: string;
  suggestedRisk: 'high' | 'medium';
  reason: string;
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
    out.push({
      checklistItemId: it.checklistItemId,
      ref: it.ref,
      suggestedTitle: `${it.ref ? `${it.ref}: ` : ''}${q ? `Gap — ${q}` : 'Обнаружен gap'}`,
      suggestedRisk: risk,
      reason: `Ответ «${it.complianceStatus}», finding отсутствует`,
    });
  }
  return out;
}
