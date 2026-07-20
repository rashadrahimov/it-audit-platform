/**
 * T-V28: библиотека шаблонов findings (Vanta Issue Templates-паритет).
 * Статичный каталог преднастроенных title/risk/recommendation; «Create from
 * template» рождает finding в статусе identified с этими полями (редактируемый).
 */

export interface FindingTemplate {
  key: string;
  title: { en: string; ru?: string };
  riskRating: 'critical' | 'high' | 'medium' | 'low';
  recommendation: { en: string; ru?: string };
}

export const FINDING_TEMPLATES: FindingTemplate[] = [
  {
    key: 'stale-access',
    title: { en: 'Stale user access not removed', ru: 'Устаревшие доступы не отозваны' },
    riskRating: 'high',
    recommendation: {
      en: 'Run an access review, revoke access for terminated or transferred users, and enforce a deprovisioning SLA.',
      ru: 'Провести пересмотр доступа, отозвать доступ уволенных/переведённых, ввести SLA на депровижнинг.',
    },
  },
  {
    key: 'mfa-gap',
    title: { en: 'MFA not enforced for all users', ru: 'MFA не включён для всех пользователей' },
    riskRating: 'high',
    recommendation: {
      en: 'Enable MFA org-wide, prioritizing privileged and remote access; monitor coverage continuously.',
      ru: 'Включить MFA по всей организации, начиная с привилегированного и удалённого доступа; мониторить покрытие.',
    },
  },
  {
    key: 'backup-untested',
    title: { en: 'Backup restore not tested', ru: 'Восстановление из бэкапа не тестировалось' },
    riskRating: 'medium',
    recommendation: {
      en: 'Perform a documented restore test at least quarterly and record results with evidence.',
      ru: 'Проводить документированный тест восстановления не реже раза в квартал, фиксировать результаты.',
    },
  },
  {
    key: 'missing-logging',
    title: { en: 'Insufficient security logging', ru: 'Недостаточное логирование безопасности' },
    riskRating: 'medium',
    recommendation: {
      en: 'Enable audit logging on critical systems, centralize logs, and define a retention period.',
      ru: 'Включить аудит-логи на критичных системах, централизовать логи, задать срок хранения.',
    },
  },
  {
    key: 'unapproved-change',
    title: { en: 'Changes deployed without approval', ru: 'Изменения без согласования' },
    riskRating: 'high',
    recommendation: {
      en: 'Enforce change approval and testing gates; review emergency changes post-implementation.',
      ru: 'Ввести обязательное согласование и тест-гейты изменений; проверять экстренные пост-фактум.',
    },
  },
  {
    key: 'vendor-unassessed',
    title: { en: 'Critical vendor not assessed', ru: 'Критичный вендор не оценён' },
    riskRating: 'medium',
    recommendation: {
      en: 'Complete a security assessment for the vendor and set a recurring review cadence.',
      ru: 'Провести оценку безопасности вендора и задать периодичность повторной проверки.',
    },
  },
  {
    key: 'policy-not-approved',
    title: { en: 'Policy overdue for review', ru: 'Политика просрочена к пересмотру' },
    riskRating: 'low',
    recommendation: {
      en: 'Review and re-approve the policy, then attest the current version with staff.',
      ru: 'Пересмотреть и переутвердить политику, провести attestation актуальной версии.',
    },
  },
  {
    key: 'unencrypted-data',
    title: { en: 'Sensitive data stored unencrypted', ru: 'Чувствительные данные без шифрования' },
    riskRating: 'critical',
    recommendation: {
      en: 'Encrypt data at rest, manage keys securely, and verify coverage across data stores.',
      ru: 'Зашифровать данные при хранении, безопасно управлять ключами, проверить покрытие хранилищ.',
    },
  },
  {
    key: 'no-incident-plan',
    title: {
      en: 'Incident response plan missing or untested',
      ru: 'План реагирования отсутствует/не тестировался',
    },
    riskRating: 'medium',
    recommendation: {
      en: 'Document an incident response plan and run an annual tabletop exercise.',
      ru: 'Задокументировать план реагирования и проводить ежегодные штабные учения.',
    },
  },
  {
    key: 'excessive-privileges',
    title: { en: 'Excessive privileged accounts', ru: 'Избыток привилегированных учёток' },
    riskRating: 'high',
    recommendation: {
      en: 'Apply least privilege, review admin accounts, and remove standing privileged access where possible.',
      ru: 'Применить минимальные привилегии, пересмотреть админ-учётки, убрать постоянный привилегированный доступ.',
    },
  },
];
