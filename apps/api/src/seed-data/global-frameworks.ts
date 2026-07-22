/**
 * T-V47: полный контент глобальной библиотеки фреймворков (EP-FWK).
 * ISO/IEC 27001:2022 Annex A — все 93 контроля; COBIT 2019 — 40 objectives;
 * NIST CSF 2.0 — 22 категории; SOC 2 TSC — 61 критерий; PCI DSS 4.0 — 12 требований;
 * GDPR — 28 ключевых статей; HIPAA Security Rule — 19 стандартов; CBAR — 32 домена.
 * ru-переводы: ISO/NIST/PCI/GDPR; az — CBAR (остальные fallback en, resolveLocalized).
 */
import { CONTROL_DOMAINS } from './global-controls';

export interface FrameworkRequirementSeed {
  ref: string;
  title: { en: string; az?: string; ru?: string };
}

export interface FrameworkSeed {
  name: { en: string; az?: string; ru?: string };
  version: string;
  domain: string;
  requirements: FrameworkRequirementSeed[];
}

const ISO_27001_ANNEX_A: FrameworkRequirementSeed[] = [
  {
    ref: 'A.5.1',
    title: { en: 'Policies for information security', ru: 'Политики информационной безопасности' },
  },
  {
    ref: 'A.5.2',
    title: {
      en: 'Information security roles and responsibilities',
      ru: 'Роли и обязанности в области информационной безопасности',
    },
  },
  { ref: 'A.5.3', title: { en: 'Segregation of duties', ru: 'Разделение обязанностей' } },
  { ref: 'A.5.4', title: { en: 'Management responsibilities', ru: 'Обязанности руководства' } },
  {
    ref: 'A.5.5',
    title: { en: 'Contact with authorities', ru: 'Взаимодействие с органами власти' },
  },
  {
    ref: 'A.5.6',
    title: {
      en: 'Contact with special interest groups',
      ru: 'Взаимодействие с профессиональными сообществами',
    },
  },
  { ref: 'A.5.7', title: { en: 'Threat intelligence', ru: 'Разведка угроз' } },
  {
    ref: 'A.5.8',
    title: { en: 'Information security in project management', ru: 'ИБ в управлении проектами' },
  },
  {
    ref: 'A.5.9',
    title: {
      en: 'Inventory of information and other associated assets',
      ru: 'Инвентаризация информации и связанных активов',
    },
  },
  {
    ref: 'A.5.10',
    title: {
      en: 'Acceptable use of information and other associated assets',
      ru: 'Допустимое использование информации и активов',
    },
  },
  { ref: 'A.5.11', title: { en: 'Return of assets', ru: 'Возврат активов' } },
  { ref: 'A.5.12', title: { en: 'Classification of information', ru: 'Классификация информации' } },
  { ref: 'A.5.13', title: { en: 'Labelling of information', ru: 'Маркировка информации' } },
  { ref: 'A.5.14', title: { en: 'Information transfer', ru: 'Передача информации' } },
  { ref: 'A.5.15', title: { en: 'Access control', ru: 'Управление доступом' } },
  { ref: 'A.5.16', title: { en: 'Identity management', ru: 'Управление идентификацией' } },
  {
    ref: 'A.5.17',
    title: { en: 'Authentication information', ru: 'Аутентификационная информация' },
  },
  { ref: 'A.5.18', title: { en: 'Access rights', ru: 'Права доступа' } },
  {
    ref: 'A.5.19',
    title: {
      en: 'Information security in supplier relationships',
      ru: 'ИБ в отношениях с поставщиками',
    },
  },
  {
    ref: 'A.5.20',
    title: {
      en: 'Addressing information security within supplier agreements',
      ru: 'ИБ в договорах с поставщиками',
    },
  },
  {
    ref: 'A.5.21',
    title: {
      en: 'Managing information security in the ICT supply chain',
      ru: 'ИБ в цепочке поставок ИКТ',
    },
  },
  {
    ref: 'A.5.22',
    title: {
      en: 'Monitoring, review and change management of supplier services',
      ru: 'Мониторинг и управление изменениями услуг поставщиков',
    },
  },
  {
    ref: 'A.5.23',
    title: {
      en: 'Information security for use of cloud services',
      ru: 'ИБ при использовании облачных услуг',
    },
  },
  {
    ref: 'A.5.24',
    title: {
      en: 'Information security incident management planning and preparation',
      ru: 'Планирование управления инцидентами ИБ',
    },
  },
  {
    ref: 'A.5.25',
    title: {
      en: 'Assessment and decision on information security events',
      ru: 'Оценка событий ИБ и принятие решений',
    },
  },
  {
    ref: 'A.5.26',
    title: { en: 'Response to information security incidents', ru: 'Реагирование на инциденты ИБ' },
  },
  {
    ref: 'A.5.27',
    title: {
      en: 'Learning from information security incidents',
      ru: 'Извлечение уроков из инцидентов ИБ',
    },
  },
  { ref: 'A.5.28', title: { en: 'Collection of evidence', ru: 'Сбор доказательств' } },
  { ref: 'A.5.29', title: { en: 'Information security during disruption', ru: 'ИБ при сбоях' } },
  {
    ref: 'A.5.30',
    title: {
      en: 'ICT readiness for business continuity',
      ru: 'Готовность ИКТ к непрерывности бизнеса',
    },
  },
  {
    ref: 'A.5.31',
    title: {
      en: 'Legal, statutory, regulatory and contractual requirements',
      ru: 'Правовые, нормативные и договорные требования',
    },
  },
  {
    ref: 'A.5.32',
    title: { en: 'Intellectual property rights', ru: 'Права интеллектуальной собственности' },
  },
  { ref: 'A.5.33', title: { en: 'Protection of records', ru: 'Защита записей' } },
  {
    ref: 'A.5.34',
    title: { en: 'Privacy and protection of PII', ru: 'Приватность и защита персональных данных' },
  },
  {
    ref: 'A.5.35',
    title: { en: 'Independent review of information security', ru: 'Независимая оценка ИБ' },
  },
  {
    ref: 'A.5.36',
    title: {
      en: 'Compliance with policies, rules and standards for information security',
      ru: 'Соответствие политикам и стандартам ИБ',
    },
  },
  {
    ref: 'A.5.37',
    title: {
      en: 'Documented operating procedures',
      ru: 'Документированные операционные процедуры',
    },
  },
  { ref: 'A.6.1', title: { en: 'Screening', ru: 'Проверка при найме' } },
  {
    ref: 'A.6.2',
    title: { en: 'Terms and conditions of employment', ru: 'Условия трудового договора' },
  },
  {
    ref: 'A.6.3',
    title: {
      en: 'Information security awareness, education and training',
      ru: 'Осведомлённость и обучение по ИБ',
    },
  },
  { ref: 'A.6.4', title: { en: 'Disciplinary process', ru: 'Дисциплинарный процесс' } },
  {
    ref: 'A.6.5',
    title: {
      en: 'Responsibilities after termination or change of employment',
      ru: 'Обязанности после увольнения или смены роли',
    },
  },
  {
    ref: 'A.6.6',
    title: {
      en: 'Confidentiality or non-disclosure agreements',
      ru: 'Соглашения о конфиденциальности',
    },
  },
  { ref: 'A.6.7', title: { en: 'Remote working', ru: 'Удалённая работа' } },
  {
    ref: 'A.6.8',
    title: { en: 'Information security event reporting', ru: 'Сообщение о событиях ИБ' },
  },
  {
    ref: 'A.7.1',
    title: { en: 'Physical security perimeters', ru: 'Периметры физической безопасности' },
  },
  { ref: 'A.7.2', title: { en: 'Physical entry', ru: 'Физический вход' } },
  {
    ref: 'A.7.3',
    title: { en: 'Securing offices, rooms and facilities', ru: 'Защита офисов и помещений' },
  },
  {
    ref: 'A.7.4',
    title: { en: 'Physical security monitoring', ru: 'Мониторинг физической безопасности' },
  },
  {
    ref: 'A.7.5',
    title: {
      en: 'Protecting against physical and environmental threats',
      ru: 'Защита от физических и природных угроз',
    },
  },
  { ref: 'A.7.6', title: { en: 'Working in secure areas', ru: 'Работа в защищённых зонах' } },
  { ref: 'A.7.7', title: { en: 'Clear desk and clear screen', ru: 'Чистый стол и чистый экран' } },
  {
    ref: 'A.7.8',
    title: { en: 'Equipment siting and protection', ru: 'Размещение и защита оборудования' },
  },
  {
    ref: 'A.7.9',
    title: { en: 'Security of assets off-premises', ru: 'Безопасность активов вне офиса' },
  },
  { ref: 'A.7.10', title: { en: 'Storage media', ru: 'Носители информации' } },
  { ref: 'A.7.11', title: { en: 'Supporting utilities', ru: 'Инженерные коммуникации' } },
  { ref: 'A.7.12', title: { en: 'Cabling security', ru: 'Безопасность кабельной инфраструктуры' } },
  { ref: 'A.7.13', title: { en: 'Equipment maintenance', ru: 'Обслуживание оборудования' } },
  {
    ref: 'A.7.14',
    title: {
      en: 'Secure disposal or re-use of equipment',
      ru: 'Безопасная утилизация или повторное использование оборудования',
    },
  },
  { ref: 'A.8.1', title: { en: 'User endpoint devices', ru: 'Конечные устройства пользователей' } },
  {
    ref: 'A.8.2',
    title: { en: 'Privileged access rights', ru: 'Привилегированные права доступа' },
  },
  {
    ref: 'A.8.3',
    title: { en: 'Information access restriction', ru: 'Ограничение доступа к информации' },
  },
  { ref: 'A.8.4', title: { en: 'Access to source code', ru: 'Доступ к исходному коду' } },
  { ref: 'A.8.5', title: { en: 'Secure authentication', ru: 'Безопасная аутентификация' } },
  { ref: 'A.8.6', title: { en: 'Capacity management', ru: 'Управление мощностями' } },
  { ref: 'A.8.7', title: { en: 'Protection against malware', ru: 'Защита от вредоносного ПО' } },
  {
    ref: 'A.8.8',
    title: {
      en: 'Management of technical vulnerabilities',
      ru: 'Управление техническими уязвимостями',
    },
  },
  { ref: 'A.8.9', title: { en: 'Configuration management', ru: 'Управление конфигурациями' } },
  { ref: 'A.8.10', title: { en: 'Information deletion', ru: 'Удаление информации' } },
  { ref: 'A.8.11', title: { en: 'Data masking', ru: 'Маскирование данных' } },
  { ref: 'A.8.12', title: { en: 'Data leakage prevention', ru: 'Предотвращение утечек данных' } },
  { ref: 'A.8.13', title: { en: 'Information backup', ru: 'Резервное копирование информации' } },
  {
    ref: 'A.8.14',
    title: {
      en: 'Redundancy of information processing facilities',
      ru: 'Резервирование средств обработки информации',
    },
  },
  { ref: 'A.8.15', title: { en: 'Logging', ru: 'Логирование' } },
  { ref: 'A.8.16', title: { en: 'Monitoring activities', ru: 'Мониторинг активности' } },
  { ref: 'A.8.17', title: { en: 'Clock synchronization', ru: 'Синхронизация времени' } },
  {
    ref: 'A.8.18',
    title: {
      en: 'Use of privileged utility programs',
      ru: 'Использование привилегированных утилит',
    },
  },
  {
    ref: 'A.8.19',
    title: {
      en: 'Installation of software on operational systems',
      ru: 'Установка ПО в производственных системах',
    },
  },
  { ref: 'A.8.20', title: { en: 'Networks security', ru: 'Безопасность сетей' } },
  {
    ref: 'A.8.21',
    title: { en: 'Security of network services', ru: 'Безопасность сетевых сервисов' },
  },
  { ref: 'A.8.22', title: { en: 'Segregation of networks', ru: 'Сегментация сетей' } },
  { ref: 'A.8.23', title: { en: 'Web filtering', ru: 'Веб-фильтрация' } },
  { ref: 'A.8.24', title: { en: 'Use of cryptography', ru: 'Использование криптографии' } },
  {
    ref: 'A.8.25',
    title: { en: 'Secure development life cycle', ru: 'Безопасный цикл разработки' },
  },
  {
    ref: 'A.8.26',
    title: { en: 'Application security requirements', ru: 'Требования безопасности приложений' },
  },
  {
    ref: 'A.8.27',
    title: {
      en: 'Secure system architecture and engineering principles',
      ru: 'Принципы безопасной архитектуры и проектирования',
    },
  },
  { ref: 'A.8.28', title: { en: 'Secure coding', ru: 'Безопасное кодирование' } },
  {
    ref: 'A.8.29',
    title: {
      en: 'Security testing in development and acceptance',
      ru: 'Тестирование безопасности при разработке и приёмке',
    },
  },
  { ref: 'A.8.30', title: { en: 'Outsourced development', ru: 'Аутсорсинговая разработка' } },
  {
    ref: 'A.8.31',
    title: {
      en: 'Separation of development, test and production environments',
      ru: 'Разделение сред разработки, тестирования и эксплуатации',
    },
  },
  { ref: 'A.8.32', title: { en: 'Change management', ru: 'Управление изменениями' } },
  { ref: 'A.8.33', title: { en: 'Test information', ru: 'Тестовые данные' } },
  {
    ref: 'A.8.34',
    title: {
      en: 'Protection of information systems during audit testing',
      ru: 'Защита ИС при аудиторском тестировании',
    },
  },
];

const COBIT_2019: FrameworkRequirementSeed[] = [
  { ref: 'EDM01', title: { en: 'Ensured governance framework setting and maintenance' } },
  { ref: 'EDM02', title: { en: 'Ensured benefits delivery' } },
  { ref: 'EDM03', title: { en: 'Ensured risk optimization' } },
  { ref: 'EDM04', title: { en: 'Ensured resource optimization' } },
  { ref: 'EDM05', title: { en: 'Ensured stakeholder engagement' } },
  { ref: 'APO01', title: { en: 'Managed I&T management framework' } },
  { ref: 'APO02', title: { en: 'Managed strategy' } },
  { ref: 'APO03', title: { en: 'Managed enterprise architecture' } },
  { ref: 'APO04', title: { en: 'Managed innovation' } },
  { ref: 'APO05', title: { en: 'Managed portfolio' } },
  { ref: 'APO06', title: { en: 'Managed budget and costs' } },
  { ref: 'APO07', title: { en: 'Managed human resources' } },
  { ref: 'APO08', title: { en: 'Managed relationships' } },
  { ref: 'APO09', title: { en: 'Managed service agreements' } },
  { ref: 'APO10', title: { en: 'Managed vendors' } },
  { ref: 'APO11', title: { en: 'Managed quality' } },
  { ref: 'APO12', title: { en: 'Managed risk' } },
  { ref: 'APO13', title: { en: 'Managed security' } },
  { ref: 'APO14', title: { en: 'Managed data' } },
  { ref: 'BAI01', title: { en: 'Managed programs' } },
  { ref: 'BAI02', title: { en: 'Managed requirements definition' } },
  { ref: 'BAI03', title: { en: 'Managed solutions identification and build' } },
  { ref: 'BAI04', title: { en: 'Managed availability and capacity' } },
  { ref: 'BAI05', title: { en: 'Managed organizational change' } },
  { ref: 'BAI06', title: { en: 'Managed IT changes' } },
  { ref: 'BAI07', title: { en: 'Managed IT change acceptance and transitioning' } },
  { ref: 'BAI08', title: { en: 'Managed knowledge' } },
  { ref: 'BAI09', title: { en: 'Managed assets' } },
  { ref: 'BAI10', title: { en: 'Managed configuration' } },
  { ref: 'BAI11', title: { en: 'Managed projects' } },
  { ref: 'DSS01', title: { en: 'Managed operations' } },
  { ref: 'DSS02', title: { en: 'Managed service requests and incidents' } },
  { ref: 'DSS03', title: { en: 'Managed problems' } },
  { ref: 'DSS04', title: { en: 'Managed continuity' } },
  { ref: 'DSS05', title: { en: 'Managed security services' } },
  { ref: 'DSS06', title: { en: 'Managed business process controls' } },
  { ref: 'MEA01', title: { en: 'Managed performance and conformance monitoring' } },
  { ref: 'MEA02', title: { en: 'Managed system of internal control' } },
  { ref: 'MEA03', title: { en: 'Managed compliance with external requirements' } },
  { ref: 'MEA04', title: { en: 'Managed assurance' } },
];

const NIST_CSF_2: FrameworkRequirementSeed[] = [
  { ref: 'GV.OC', title: { en: 'Organizational context', ru: 'Организационный контекст' } },
  { ref: 'GV.RM', title: { en: 'Risk management strategy', ru: 'Стратегия управления рисками' } },
  {
    ref: 'GV.RR',
    title: { en: 'Roles, responsibilities, and authorities', ru: 'Роли, обязанности и полномочия' },
  },
  { ref: 'GV.PO', title: { en: 'Policy', ru: 'Политика' } },
  { ref: 'GV.OV', title: { en: 'Oversight', ru: 'Надзор' } },
  {
    ref: 'GV.SC',
    title: { en: 'Cybersecurity supply chain risk management', ru: 'Риски киберцепочки поставок' },
  },
  { ref: 'ID.AM', title: { en: 'Asset management', ru: 'Управление активами' } },
  { ref: 'ID.RA', title: { en: 'Risk assessment', ru: 'Оценка рисков' } },
  { ref: 'ID.IM', title: { en: 'Improvement', ru: 'Совершенствование' } },
  {
    ref: 'PR.AA',
    title: {
      en: 'Identity management, authentication, and access control',
      ru: 'Идентификация, аутентификация и контроль доступа',
    },
  },
  { ref: 'PR.AT', title: { en: 'Awareness and training', ru: 'Осведомлённость и обучение' } },
  { ref: 'PR.DS', title: { en: 'Data security', ru: 'Безопасность данных' } },
  { ref: 'PR.PS', title: { en: 'Platform security', ru: 'Безопасность платформ' } },
  {
    ref: 'PR.IR',
    title: {
      en: 'Technology infrastructure resilience',
      ru: 'Устойчивость технологической инфраструктуры',
    },
  },
  { ref: 'DE.CM', title: { en: 'Continuous monitoring', ru: 'Непрерывный мониторинг' } },
  { ref: 'DE.AE', title: { en: 'Adverse event analysis', ru: 'Анализ неблагоприятных событий' } },
  { ref: 'RS.MA', title: { en: 'Incident management', ru: 'Управление инцидентами' } },
  { ref: 'RS.AN', title: { en: 'Incident analysis', ru: 'Анализ инцидентов' } },
  {
    ref: 'RS.CO',
    title: {
      en: 'Incident response reporting and communication',
      ru: 'Отчётность и коммуникации при реагировании',
    },
  },
  { ref: 'RS.MI', title: { en: 'Incident mitigation', ru: 'Смягчение инцидентов' } },
  {
    ref: 'RC.RP',
    title: { en: 'Incident recovery plan execution', ru: 'Выполнение плана восстановления' },
  },
  {
    ref: 'RC.CO',
    title: { en: 'Incident recovery communication', ru: 'Коммуникации при восстановлении' },
  },
];

const SOC2_TSC: FrameworkRequirementSeed[] = [
  { ref: 'CC1.1', title: { en: 'Demonstrates commitment to integrity and ethical values' } },
  { ref: 'CC1.2', title: { en: 'Exercises oversight responsibility' } },
  { ref: 'CC1.3', title: { en: 'Establishes structure, authority, and responsibility' } },
  { ref: 'CC1.4', title: { en: 'Demonstrates commitment to competence' } },
  { ref: 'CC1.5', title: { en: 'Enforces accountability' } },
  { ref: 'CC2.1', title: { en: 'Uses relevant, quality information' } },
  { ref: 'CC2.2', title: { en: 'Communicates internally' } },
  { ref: 'CC2.3', title: { en: 'Communicates externally' } },
  { ref: 'CC3.1', title: { en: 'Specifies suitable objectives' } },
  { ref: 'CC3.2', title: { en: 'Identifies and analyzes risk' } },
  { ref: 'CC3.3', title: { en: 'Considers potential for fraud' } },
  { ref: 'CC3.4', title: { en: 'Identifies and analyzes significant change' } },
  { ref: 'CC4.1', title: { en: 'Performs ongoing and separate evaluations' } },
  { ref: 'CC4.2', title: { en: 'Evaluates and communicates deficiencies' } },
  { ref: 'CC5.1', title: { en: 'Selects and develops control activities' } },
  { ref: 'CC5.2', title: { en: 'Selects and develops general controls over technology' } },
  { ref: 'CC5.3', title: { en: 'Deploys controls through policies and procedures' } },
  { ref: 'CC6.1', title: { en: 'Implements logical access security software and infrastructure' } },
  { ref: 'CC6.2', title: { en: 'Registers and authorizes new users' } },
  { ref: 'CC6.3', title: { en: 'Manages access removal and modification' } },
  { ref: 'CC6.4', title: { en: 'Restricts physical access' } },
  { ref: 'CC6.5', title: { en: 'Discontinues protections over disposed assets' } },
  { ref: 'CC6.6', title: { en: 'Manages threats from outside system boundaries' } },
  { ref: 'CC6.7', title: { en: 'Restricts movement and transmission of information' } },
  { ref: 'CC6.8', title: { en: 'Prevents and detects unauthorized or malicious software' } },
  { ref: 'CC7.1', title: { en: 'Detects configuration changes and vulnerabilities' } },
  { ref: 'CC7.2', title: { en: 'Monitors for anomalies and security events' } },
  { ref: 'CC7.3', title: { en: 'Evaluates security events' } },
  { ref: 'CC7.4', title: { en: 'Responds to identified security incidents' } },
  { ref: 'CC7.5', title: { en: 'Recovers from identified security incidents' } },
  { ref: 'CC8.1', title: { en: 'Manages changes to infrastructure, data, and software' } },
  { ref: 'CC9.1', title: { en: 'Identifies and mitigates risk of business disruption' } },
  { ref: 'CC9.2', title: { en: 'Assesses and manages vendor and business partner risks' } },
  { ref: 'A1.1', title: { en: 'Manages capacity to meet availability commitments' } },
  { ref: 'A1.2', title: { en: 'Environmental protections, backup, and recovery infrastructure' } },
  { ref: 'A1.3', title: { en: 'Tests recovery plan procedures' } },
  { ref: 'C1.1', title: { en: 'Identifies and maintains confidential information' } },
  { ref: 'C1.2', title: { en: 'Disposes of confidential information' } },
  { ref: 'PI1.1', title: { en: 'Defines data processing specifications' } },
  { ref: 'PI1.2', title: { en: 'Controls system inputs' } },
  { ref: 'PI1.3', title: { en: 'Controls system processing' } },
  { ref: 'PI1.4', title: { en: 'Controls system outputs' } },
  { ref: 'PI1.5', title: { en: 'Stores data completely and accurately' } },
  { ref: 'P1.1', title: { en: 'Provides privacy notice' } },
  { ref: 'P2.1', title: { en: 'Communicates choices and obtains consent' } },
  { ref: 'P3.1', title: { en: 'Collects personal information consistent with objectives' } },
  { ref: 'P3.2', title: { en: 'Obtains explicit consent for sensitive information' } },
  { ref: 'P4.1', title: { en: 'Limits use of personal information' } },
  { ref: 'P4.2', title: { en: 'Retains personal information per objectives' } },
  { ref: 'P4.3', title: { en: 'Securely disposes of personal information' } },
  { ref: 'P5.1', title: { en: 'Grants data subjects access to their information' } },
  { ref: 'P5.2', title: { en: 'Corrects personal information upon request' } },
  { ref: 'P6.1', title: { en: 'Discloses personal information only with consent' } },
  { ref: 'P6.2', title: { en: 'Creates and retains record of authorized disclosures' } },
  { ref: 'P6.3', title: { en: 'Creates and retains record of unauthorized disclosures' } },
  { ref: 'P6.4', title: { en: 'Holds third parties accountable for personal information' } },
  { ref: 'P6.5', title: { en: 'Obtains commitments on unauthorized disclosure notification' } },
  { ref: 'P6.6', title: { en: 'Provides notification of breaches and incidents' } },
  { ref: 'P6.7', title: { en: 'Accounts for disclosures upon request' } },
  { ref: 'P7.1', title: { en: 'Maintains accurate, complete personal information' } },
  { ref: 'P8.1', title: { en: 'Manages inquiries, complaints, and disputes' } },
];

const PCI_DSS_4: FrameworkRequirementSeed[] = [
  {
    ref: 'Req.1',
    title: {
      en: 'Install and maintain network security controls',
      ru: 'Установка и поддержка сетевых средств защиты',
    },
  },
  {
    ref: 'Req.2',
    title: {
      en: 'Apply secure configurations to all system components',
      ru: 'Безопасные конфигурации всех компонентов',
    },
  },
  {
    ref: 'Req.3',
    title: { en: 'Protect stored account data', ru: 'Защита хранимых данных держателей карт' },
  },
  {
    ref: 'Req.4',
    title: {
      en: 'Protect cardholder data with strong cryptography during transmission',
      ru: 'Криптографическая защита данных при передаче',
    },
  },
  {
    ref: 'Req.5',
    title: {
      en: 'Protect all systems and networks from malicious software',
      ru: 'Защита систем и сетей от вредоносного ПО',
    },
  },
  {
    ref: 'Req.6',
    title: {
      en: 'Develop and maintain secure systems and software',
      ru: 'Разработка и поддержка безопасных систем и ПО',
    },
  },
  {
    ref: 'Req.7',
    title: {
      en: 'Restrict access by business need to know',
      ru: 'Ограничение доступа по служебной необходимости',
    },
  },
  {
    ref: 'Req.8',
    title: {
      en: 'Identify users and authenticate access',
      ru: 'Идентификация пользователей и аутентификация доступа',
    },
  },
  {
    ref: 'Req.9',
    title: {
      en: 'Restrict physical access to cardholder data',
      ru: 'Ограничение физического доступа к данным карт',
    },
  },
  {
    ref: 'Req.10',
    title: {
      en: 'Log and monitor all access to system components',
      ru: 'Логирование и мониторинг доступа',
    },
  },
  {
    ref: 'Req.11',
    title: {
      en: 'Test security of systems and networks regularly',
      ru: 'Регулярное тестирование безопасности',
    },
  },
  {
    ref: 'Req.12',
    title: {
      en: 'Support information security with organizational policies',
      ru: 'Поддержка ИБ организационными политиками',
    },
  },
];

const GDPR_ARTICLES: FrameworkRequirementSeed[] = [
  {
    ref: 'Art.5',
    title: {
      en: 'Principles relating to processing of personal data',
      ru: 'Принципы обработки персональных данных',
    },
  },
  { ref: 'Art.6', title: { en: 'Lawfulness of processing', ru: 'Законность обработки' } },
  { ref: 'Art.7', title: { en: 'Conditions for consent', ru: 'Условия согласия' } },
  {
    ref: 'Art.8',
    title: {
      en: "Child's consent in relation to information society services",
      ru: 'Согласие ребёнка',
    },
  },
  {
    ref: 'Art.9',
    title: {
      en: 'Processing of special categories of personal data',
      ru: 'Особые категории персональных данных',
    },
  },
  {
    ref: 'Art.12',
    title: {
      en: 'Transparent information and communication',
      ru: 'Прозрачность информации и коммуникаций',
    },
  },
  {
    ref: 'Art.13',
    title: {
      en: 'Information to be provided (data collected from subject)',
      ru: 'Информирование при сборе у субъекта',
    },
  },
  {
    ref: 'Art.14',
    title: {
      en: 'Information to be provided (data not from subject)',
      ru: 'Информирование при сборе не у субъекта',
    },
  },
  {
    ref: 'Art.15',
    title: { en: 'Right of access by the data subject', ru: 'Право субъекта на доступ' },
  },
  { ref: 'Art.16', title: { en: 'Right to rectification', ru: 'Право на исправление' } },
  { ref: 'Art.17', title: { en: 'Right to erasure', ru: 'Право на удаление' } },
  {
    ref: 'Art.18',
    title: { en: 'Right to restriction of processing', ru: 'Право на ограничение обработки' },
  },
  {
    ref: 'Art.20',
    title: { en: 'Right to data portability', ru: 'Право на переносимость данных' },
  },
  { ref: 'Art.21', title: { en: 'Right to object', ru: 'Право на возражение' } },
  {
    ref: 'Art.22',
    title: {
      en: 'Automated individual decision-making',
      ru: 'Автоматизированное принятие решений',
    },
  },
  {
    ref: 'Art.24',
    title: { en: 'Responsibility of the controller', ru: 'Ответственность контролёра' },
  },
  {
    ref: 'Art.25',
    title: {
      en: 'Data protection by design and by default',
      ru: 'Защита данных by design и by default',
    },
  },
  { ref: 'Art.26', title: { en: 'Joint controllers', ru: 'Совместные контролёры' } },
  { ref: 'Art.28', title: { en: 'Processor', ru: 'Обработчик' } },
  {
    ref: 'Art.30',
    title: { en: 'Records of processing activities', ru: 'Реестр операций обработки' },
  },
  { ref: 'Art.32', title: { en: 'Security of processing', ru: 'Безопасность обработки' } },
  {
    ref: 'Art.33',
    title: {
      en: 'Notification of breach to supervisory authority',
      ru: 'Уведомление регулятора об утечке',
    },
  },
  {
    ref: 'Art.34',
    title: { en: 'Communication of breach to data subject', ru: 'Уведомление субъекта об утечке' },
  },
  {
    ref: 'Art.35',
    title: { en: 'Data protection impact assessment', ru: 'Оценка влияния на защиту данных' },
  },
  { ref: 'Art.36', title: { en: 'Prior consultation', ru: 'Предварительная консультация' } },
  {
    ref: 'Art.37',
    title: { en: 'Designation of the data protection officer', ru: 'Назначение DPO' },
  },
  {
    ref: 'Art.44',
    title: { en: 'General principle for transfers', ru: 'Общий принцип трансграничной передачи' },
  },
  {
    ref: 'Art.46',
    title: {
      en: 'Transfers subject to appropriate safeguards',
      ru: 'Передача при надлежащих гарантиях',
    },
  },
];

const HIPAA_SECURITY_RULE: FrameworkRequirementSeed[] = [
  { ref: '164.308(a)(1)', title: { en: 'Security management process' } },
  { ref: '164.308(a)(2)', title: { en: 'Assigned security responsibility' } },
  { ref: '164.308(a)(3)', title: { en: 'Workforce security' } },
  { ref: '164.308(a)(4)', title: { en: 'Information access management' } },
  { ref: '164.308(a)(5)', title: { en: 'Security awareness and training' } },
  { ref: '164.308(a)(6)', title: { en: 'Security incident procedures' } },
  { ref: '164.308(a)(7)', title: { en: 'Contingency plan' } },
  { ref: '164.308(a)(8)', title: { en: 'Evaluation' } },
  { ref: '164.308(b)(1)', title: { en: 'Business associate contracts and other arrangements' } },
  { ref: '164.310(a)(1)', title: { en: 'Facility access controls' } },
  { ref: '164.310(b)', title: { en: 'Workstation use' } },
  { ref: '164.310(c)', title: { en: 'Workstation security' } },
  { ref: '164.310(d)(1)', title: { en: 'Device and media controls' } },
  { ref: '164.312(a)(1)', title: { en: 'Access control' } },
  { ref: '164.312(b)', title: { en: 'Audit controls' } },
  { ref: '164.312(c)(1)', title: { en: 'Integrity' } },
  { ref: '164.312(d)', title: { en: 'Person or entity authentication' } },
  { ref: '164.312(e)(1)', title: { en: 'Transmission security' } },
  { ref: '164.316', title: { en: 'Policies, procedures, and documentation requirements' } },
];

// Местный регулятор (T-001/T-C01): CBAR IT-audit backbone = те же 32 control domains,
// что и глобальная таксономия контролей. Один источник предотвращает дрейф scope.
export const CBAR_DOMAINS: FrameworkRequirementSeed[] = CONTROL_DOMAINS.map((domain) => ({
  ref: domain.code,
  title: domain.name,
}));

export const GLOBAL_FRAMEWORKS: FrameworkSeed[] = [
  {
    name: { en: 'ISO/IEC 27001' },
    version: '2022',
    domain: 'security',
    requirements: ISO_27001_ANNEX_A,
  },
  { name: { en: 'COBIT' }, version: '2019', domain: 'security', requirements: COBIT_2019 },
  { name: { en: 'NIST CSF' }, version: '2.0', domain: 'security', requirements: NIST_CSF_2 },
  {
    name: { en: 'SOC 2' },
    version: '2017 (rev. 2022)',
    domain: 'security',
    requirements: SOC2_TSC,
  },
  { name: { en: 'PCI DSS' }, version: '4.0', domain: 'industry', requirements: PCI_DSS_4 },
  { name: { en: 'GDPR' }, version: '2016/679', domain: 'privacy', requirements: GDPR_ARTICLES },
  {
    name: { en: 'HIPAA' },
    version: 'Security Rule',
    domain: 'industry',
    requirements: HIPAA_SECURITY_RULE,
  },
  {
    name: { en: 'CBAR IT Audit', az: 'MB İT Audit', ru: 'ЦБА ИТ-аудит' },
    version: 'v1.0',
    domain: 'industry',
    requirements: CBAR_DOMAINS,
  },
];
