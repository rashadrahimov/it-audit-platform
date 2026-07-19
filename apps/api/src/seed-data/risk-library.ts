/**
 * T-V23: глобальная библиотека risk-сценариев (Vanta Risk Library-паритет).
 * Строки risk с tenant_id NULL (ADR-0016); «Add to register» копирует сценарий
 * в реестр тенанта с пересчётом класса по его матрице и source_risk_id.
 */

export interface RiskLibraryItem {
  title: { en: string; ru?: string };
  description: { en: string; ru?: string };
  category: string;
  inherentImpact: number;
  inherentLikelihood: number;
}

export const RISK_LIBRARY: RiskLibraryItem[] = [
  {
    title: {
      en: 'Unauthorized access to production systems',
      ru: 'Несанкционированный доступ к прод-системам',
    },
    description: {
      en: 'Excessive or stale access rights allow unauthorized users to reach production systems and data.',
      ru: 'Избыточные или устаревшие права позволяют посторонним достигать прод-систем и данных.',
    },
    category: 'access',
    inherentImpact: 5,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Privileged account misuse', ru: 'Злоупотребление привилегированными учётками' },
    description: {
      en: 'Administrative accounts are used without oversight, enabling untracked destructive changes.',
      ru: 'Административные учётки используются без надзора — неотслеживаемые разрушительные изменения.',
    },
    category: 'access',
    inherentImpact: 5,
    inherentLikelihood: 2,
  },
  {
    title: { en: 'Data breach of customer PII', ru: 'Утечка персональных данных клиентов' },
    description: {
      en: 'Customer personal data is exfiltrated through weak controls, causing regulatory and reputational damage.',
      ru: 'Персональные данные клиентов утекают из-за слабых контролей — регуляторный и репутационный ущерб.',
    },
    category: 'data',
    inherentImpact: 5,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Ransomware outbreak', ru: 'Атака шифровальщика' },
    description: {
      en: 'Malware encrypts critical systems and backups, halting operations and demanding ransom.',
      ru: 'Вредонос шифрует критичные системы и бэкапы, останавливая работу и требуя выкуп.',
    },
    category: 'security',
    inherentImpact: 5,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Critical system outage', ru: 'Отказ критичной системы' },
    description: {
      en: 'Core business system becomes unavailable beyond recovery objectives due to infrastructure failure.',
      ru: 'Ключевая система недоступна дольше целевых сроков восстановления из-за отказа инфраструктуры.',
    },
    category: 'availability',
    inherentImpact: 4,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Backup failure goes unnoticed', ru: 'Незамеченный сбой резервного копирования' },
    description: {
      en: 'Backups silently fail; data cannot be restored after an incident.',
      ru: 'Бэкапы тихо падают; после инцидента данные восстановить нечем.',
    },
    category: 'availability',
    inherentImpact: 4,
    inherentLikelihood: 2,
  },
  {
    title: { en: 'Unauthorized changes to production', ru: 'Несогласованные изменения в проде' },
    description: {
      en: 'Changes bypass approval and testing, introducing defects and unlogged modifications.',
      ru: 'Изменения минуют согласование и тестирование — дефекты и неучтённые модификации.',
    },
    category: 'change',
    inherentImpact: 4,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Critical vendor failure', ru: 'Отказ критичного вендора' },
    description: {
      en: 'A critical third-party provider suffers an outage or breach that cascades to the organization.',
      ru: 'Критичный поставщик падает или ломается — эффект каскадом бьёт по организации.',
    },
    category: 'vendor',
    inherentImpact: 4,
    inherentLikelihood: 2,
  },
  {
    title: { en: 'Vendor data processing violation', ru: 'Нарушение обработки данных вендором' },
    description: {
      en: 'A processor handles personal data outside contractual and regulatory boundaries.',
      ru: 'Обработчик работает с персональными данными вне договора и регуляторики.',
    },
    category: 'vendor',
    inherentImpact: 4,
    inherentLikelihood: 2,
  },
  {
    title: { en: 'Regulatory non-compliance fine', ru: 'Штраф за несоответствие регуляторике' },
    description: {
      en: 'Failure to meet regulator requirements results in fines and mandated remediation.',
      ru: 'Невыполнение требований регулятора — штрафы и предписания.',
    },
    category: 'compliance',
    inherentImpact: 4,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Audit evidence not available', ru: 'Недоступность аудиторских доказательств' },
    description: {
      en: 'Logs and records needed for audits are missing or expired, blocking assurance.',
      ru: 'Логи и записи для аудита отсутствуют или истекли — подтверждение невозможно.',
    },
    category: 'compliance',
    inherentImpact: 3,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Key person dependency', ru: 'Зависимость от ключевого сотрудника' },
    description: {
      en: 'Critical knowledge concentrated in one person; departure halts operations or projects.',
      ru: 'Критичные знания у одного человека; уход останавливает процессы или проекты.',
    },
    category: 'people',
    inherentImpact: 3,
    inherentLikelihood: 3,
  },
  {
    title: { en: 'Phishing leads to credential theft', ru: 'Фишинг с кражей учётных данных' },
    description: {
      en: 'Employees fall for phishing; stolen credentials open the door to internal systems.',
      ru: 'Сотрудники ведутся на фишинг; украденные учётки открывают внутренние системы.',
    },
    category: 'people',
    inherentImpact: 4,
    inherentLikelihood: 4,
  },
  {
    title: { en: 'Shadow IT usage', ru: 'Теневое ИТ' },
    description: {
      en: 'Teams adopt unapproved SaaS and tools, moving data outside controlled boundaries.',
      ru: 'Команды используют несогласованные SaaS и инструменты — данные вне контролируемого контура.',
    },
    category: 'security',
    inherentImpact: 3,
    inherentLikelihood: 4,
  },
];
