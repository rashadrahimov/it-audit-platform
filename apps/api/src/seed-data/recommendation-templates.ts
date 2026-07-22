import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { ACTION_PLAN_DUE_DAYS } from '../tasks/action-plan-seed';

export type RecommendationTemplateKey =
  'access-review' | 'backup-restore' | 'logging-monitoring' | 'vendor-review' | 'policy-refresh';

export interface RecommendationTemplate {
  key: RecommendationTemplateKey;
  controlClause: string;
  category: 'access' | 'continuity' | 'monitoring' | 'third_party' | 'governance';
  riskRating: keyof typeof ACTION_PLAN_DUE_DAYS;
  title: I18nText;
  recommendation: I18nText;
  ownerRole: I18nText;
}

export const RECOMMENDATION_TEMPLATES: RecommendationTemplate[] = [
  {
    key: 'access-review',
    controlClause: 'ISO 27001 A.5.18',
    category: 'access',
    riskRating: 'high',
    title: {
      en: 'Access review remediation',
      ru: 'Ремедиация пересмотра доступа',
      az: 'Giriş icmalının aradan qaldırılması',
    },
    recommendation: {
      en: 'Run a documented access review, revoke stale access and attach reviewer evidence.',
      ru: 'Провести документированный пересмотр доступа, отозвать устаревшие доступы и приложить evidence ревьюера.',
      az: 'Sənədləşdirilmiş giriş icmalı aparın, köhnə girişləri ləğv edin və reviewer sübutunu əlavə edin.',
    },
    ownerRole: { en: 'IAM owner', ru: 'Владелец IAM', az: 'IAM sahibi' },
  },
  {
    key: 'backup-restore',
    controlClause: 'ISO 27001 A.8.13',
    category: 'continuity',
    riskRating: 'medium',
    title: {
      en: 'Backup restore evidence',
      ru: 'Evidence восстановления из бэкапа',
      az: 'Backup bərpası sübutu',
    },
    recommendation: {
      en: 'Perform a restore test, record the result and schedule recurring evidence collection.',
      ru: 'Провести тест восстановления, зафиксировать результат и настроить регулярный сбор evidence.',
      az: 'Bərpa testi keçirin, nəticəni qeyd edin və müntəzəm sübut toplanmasını planlaşdırın.',
    },
    ownerRole: {
      en: 'Infrastructure owner',
      ru: 'Владелец инфраструктуры',
      az: 'İnfrastruktur sahibi',
    },
  },
  {
    key: 'logging-monitoring',
    controlClause: 'ISO 27001 A.8.15',
    category: 'monitoring',
    riskRating: 'medium',
    title: {
      en: 'Security logging baseline',
      ru: 'Базовая линия security logging',
      az: 'Təhlükəsizlik loglama bazası',
    },
    recommendation: {
      en: 'Enable audit logs on critical systems, centralize retention and define review cadence.',
      ru: 'Включить audit logs на критичных системах, централизовать хранение и задать cadence ревью.',
      az: 'Kritik sistemlərdə audit loglarını aktiv edin, saxlamanı mərkəzləşdirin və icmal dövrünü təyin edin.',
    },
    ownerRole: {
      en: 'Security operations',
      ru: 'Security operations',
      az: 'Təhlükəsizlik əməliyyatları',
    },
  },
  {
    key: 'vendor-review',
    controlClause: 'ISO 27001 A.5.19',
    category: 'third_party',
    riskRating: 'medium',
    title: {
      en: 'Critical vendor reassessment',
      ru: 'Повторная оценка критичного вендора',
      az: 'Kritik vendorun təkrar qiymətləndirilməsi',
    },
    recommendation: {
      en: 'Collect updated vendor evidence, reassess risk and document acceptance or remediation.',
      ru: 'Собрать свежие доказательства вендора, переоценить риск и оформить принятие или remediation.',
      az: 'Yenilənmiş vendor sübutlarını toplayın, riski yenidən qiymətləndirin və qəbul/remediasiyanı sənədləşdirin.',
    },
    ownerRole: { en: 'Vendor manager', ru: 'Vendor manager', az: 'Vendor meneceri' },
  },
  {
    key: 'policy-refresh',
    controlClause: 'ISO 27001 A.5.1',
    category: 'governance',
    riskRating: 'low',
    title: {
      en: 'Policy refresh and attestation',
      ru: 'Обновление политики и attestation',
      az: 'Siyasət yenilənməsi və attestasiya',
    },
    recommendation: {
      en: 'Review the policy, publish the current version and capture employee acknowledgement.',
      ru: 'Пересмотреть политику, опубликовать актуальную версию и собрать подтверждения сотрудников.',
      az: 'Siyasəti nəzərdən keçirin, aktual versiyanı yayımlayın və əməkdaş təsdiqlərini toplayın.',
    },
    ownerRole: { en: 'Control owner', ru: 'Владелец контроля', az: 'Kontrol sahibi' },
  },
];

export function localizedRecommendationTemplates(locale: Locale) {
  return RECOMMENDATION_TEMPLATES.map((template) => ({
    key: template.key,
    controlClause: template.controlClause,
    category: template.category,
    riskRating: template.riskRating,
    title: resolveLocalized(template.title, locale),
    recommendation: resolveLocalized(template.recommendation, locale),
    ownerRole: resolveLocalized(template.ownerRole, locale),
    suggestedDueDays: ACTION_PLAN_DUE_DAYS[template.riskRating],
    actionPlanReady: true,
    humanReviewRequired: true,
  }));
}
