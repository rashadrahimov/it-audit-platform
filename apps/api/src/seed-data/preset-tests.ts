/**
 * T-V22: библиотека готовых тестов «из коробки» (Vanta-паритет). Привязка к
 * глобальным контролам по ref (seed-data/global-controls); категории hr | it.
 * Категория automated проставляется автоматически при kind=automated (T-050).
 */

export interface PresetTestSeed {
  controlRef: string;
  title: { en: string; ru?: string };
  category: 'hr' | 'it';
  frequency: 'monthly' | 'quarterly' | 'annual';
}

export const PRESET_TESTS: PresetTestSeed[] = [
  // HR-домен: люди, доступы, обучение
  {
    controlRef: 'SA-01',
    title: {
      en: 'Security awareness training completion review',
      ru: 'Проверка прохождения обучения по ИБ',
    },
    category: 'hr',
    frequency: 'quarterly',
  },
  {
    controlRef: 'SA-01',
    title: {
      en: 'New hire security onboarding check',
      ru: 'Проверка ИБ-инструктажа новых сотрудников',
    },
    category: 'hr',
    frequency: 'quarterly',
  },
  {
    controlRef: 'AC-05',
    title: {
      en: 'Terminated employees access removal check',
      ru: 'Проверка отзыва доступов уволенных',
    },
    category: 'hr',
    frequency: 'monthly',
  },
  {
    controlRef: 'AC-01',
    title: {
      en: 'Access control policy acknowledgement review',
      ru: 'Проверка ознакомления с политикой доступа',
    },
    category: 'hr',
    frequency: 'annual',
  },
  {
    controlRef: 'GOV-02',
    title: {
      en: 'Roles and responsibilities matrix review',
      ru: 'Пересмотр матрицы ролей и обязанностей',
    },
    category: 'hr',
    frequency: 'annual',
  },
  {
    controlRef: 'GOV-01',
    title: {
      en: 'Information security policy annual review',
      ru: 'Ежегодный пересмотр политики ИБ',
    },
    category: 'hr',
    frequency: 'annual',
  },
  // IT-домен: инфраструктура, операции
  {
    controlRef: 'AC-02',
    title: { en: 'Privileged accounts review', ru: 'Пересмотр привилегированных учёток' },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'AC-03',
    title: {
      en: 'User access review campaign executed',
      ru: 'Проведение кампании пересмотра доступов',
    },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'AC-04',
    title: { en: 'MFA coverage check', ru: 'Проверка покрытия MFA' },
    category: 'it',
    frequency: 'monthly',
  },
  {
    controlRef: 'BK-01',
    title: { en: 'Backup success rate review', ru: 'Проверка успешности бэкапов' },
    category: 'it',
    frequency: 'monthly',
  },
  {
    controlRef: 'BK-02',
    title: { en: 'Backup restore test', ru: 'Тест восстановления из бэкапа' },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'DR-01',
    title: { en: 'Disaster recovery exercise', ru: 'Учения по аварийному восстановлению' },
    category: 'it',
    frequency: 'annual',
  },
  {
    controlRef: 'NW-01',
    title: { en: 'Firewall rule set review', ru: 'Пересмотр правил межсетевого экрана' },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'NW-03',
    title: { en: 'Network segmentation verification', ru: 'Проверка сегментации сети' },
    category: 'it',
    frequency: 'annual',
  },
  {
    controlRef: 'VM-01',
    title: { en: 'Vulnerability scan findings triage', ru: 'Разбор результатов скана уязвимостей' },
    category: 'it',
    frequency: 'monthly',
  },
  {
    controlRef: 'VM-02',
    title: { en: 'Critical patch SLA compliance check', ru: 'Проверка SLA критичных патчей' },
    category: 'it',
    frequency: 'monthly',
  },
  {
    controlRef: 'CM-01',
    title: { en: 'Change tickets sample inspection', ru: 'Выборочная проверка тикетов изменений' },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'CM-02',
    title: {
      en: 'Emergency changes post-approval review',
      ru: 'Проверка пост-одобрения экстренных изменений',
    },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'EP-01',
    title: {
      en: 'Endpoint protection coverage check',
      ru: 'Проверка покрытия защиты конечных точек',
    },
    category: 'it',
    frequency: 'monthly',
  },
  {
    controlRef: 'LM-01',
    title: { en: 'Security log review', ru: 'Обзор журналов безопасности' },
    category: 'it',
    frequency: 'monthly',
  },
  {
    controlRef: 'LM-02',
    title: { en: 'Log retention configuration check', ru: 'Проверка настроек хранения логов' },
    category: 'it',
    frequency: 'annual',
  },
  {
    controlRef: 'DP-01',
    title: { en: 'Encryption at rest verification', ru: 'Проверка шифрования при хранении' },
    category: 'it',
    frequency: 'annual',
  },
  {
    controlRef: 'TP-01',
    title: {
      en: 'Critical vendor assessments up to date',
      ru: 'Актуальность оценок критичных вендоров',
    },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'IR-01',
    title: { en: 'Incident response tabletop exercise', ru: 'Штабные учения по инцидентам' },
    category: 'it',
    frequency: 'annual',
  },
  {
    controlRef: 'CL-01',
    title: {
      en: 'Cloud configuration baseline review',
      ru: 'Проверка базовой конфигурации облака',
    },
    category: 'it',
    frequency: 'quarterly',
  },
  {
    controlRef: 'PH-01',
    title: { en: 'Physical access rights review', ru: 'Пересмотр прав физического доступа' },
    category: 'it',
    frequency: 'quarterly',
  },
];
