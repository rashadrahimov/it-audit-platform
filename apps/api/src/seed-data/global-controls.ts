/**
 * Глобальная библиотека контролей (T-031, ADR-0016).
 * Backbone продукта по требованиям клиента: 32 control domains для CBAR/ISO-based
 * IT audit methodology. Первые 16 доменов сохранены из исходного чеклиста клиента;
 * остальные 16 расширяют scope до полного enterprise IT/security audit coverage.
 */

export const CONTROL_DOMAINS = [
  {
    code: 'GOV',
    name: { en: 'IT Governance', az: 'İT idarəetməsi', ru: 'ИТ-управление' },
  },
  {
    code: 'AC',
    name: { en: 'Access Control', az: 'Girişə nəzarət', ru: 'Управление доступом' },
  },
  {
    code: 'CM',
    name: {
      en: 'Change Management',
      az: 'Dəyişikliklərin idarə edilməsi',
      ru: 'Управление изменениями',
    },
  },
  {
    code: 'BK',
    name: {
      en: 'Backup & Recovery',
      az: 'Ehtiyat nüsxə və bərpa',
      ru: 'Резервное копирование и восстановление',
    },
  },
  {
    code: 'DR',
    name: { en: 'Business Continuity', az: 'Biznesin fasiləsizliyi', ru: 'Непрерывность бизнеса' },
  },
  {
    code: 'NW',
    name: { en: 'Network Security', az: 'Şəbəkə təhlükəsizliyi', ru: 'Сетевая безопасность' },
  },
  {
    code: 'VM',
    name: {
      en: 'Vulnerability Management',
      az: 'Zəifliklərin idarə edilməsi',
      ru: 'Управление уязвимостями',
    },
  },
  {
    code: 'EP',
    name: {
      en: 'Endpoint Security',
      az: 'Son nöqtə təhlükəsizliyi',
      ru: 'Защита конечных устройств',
    },
  },
  {
    code: 'LM',
    name: {
      en: 'Logging & Monitoring',
      az: 'Jurnal və monitorinq',
      ru: 'Логирование и мониторинг',
    },
  },
  {
    code: 'DP',
    name: { en: 'Data Protection', az: 'Məlumatların qorunması', ru: 'Защита данных' },
  },
  {
    code: 'TP',
    name: {
      en: 'Third-Party / Vendor',
      az: 'Üçüncü tərəf / təchizatçı',
      ru: 'Третьи стороны / вендоры',
    },
  },
  {
    code: 'IR',
    name: {
      en: 'Incident Management',
      az: 'İnsidentlərin idarə edilməsi',
      ru: 'Управление инцидентами',
    },
  },
  {
    code: 'AM',
    name: { en: 'Asset Management', az: 'Aktivlərin idarə edilməsi', ru: 'Управление активами' },
  },
  {
    code: 'CL',
    name: { en: 'Cloud Security', az: 'Bulud təhlükəsizliyi', ru: 'Безопасность облака' },
  },
  {
    code: 'PH',
    name: { en: 'Physical Security', az: 'Fiziki təhlükəsizlik', ru: 'Физическая безопасность' },
  },
  {
    code: 'SA',
    name: {
      en: 'Security Awareness',
      az: 'Təhlükəsizlik maarifləndirməsi',
      ru: 'Осведомлённость о безопасности',
    },
  },
  {
    code: 'ORG',
    name: { en: 'IT Organization', az: 'İT təşkilatı', ru: 'ИТ-организация' },
  },
  {
    code: 'RM',
    name: { en: 'IT Risk Management', az: 'İT risk idarəetməsi', ru: 'Управление ИТ-рисками' },
  },
  {
    code: 'HR',
    name: { en: 'People Security', az: 'Personal təhlükəsizliyi', ru: 'Безопасность персонала' },
  },
  {
    code: 'CR',
    name: {
      en: 'Cryptography & Key Management',
      az: 'Kriptoqrafiya və açar idarəetməsi',
      ru: 'Криптография и управление ключами',
    },
  },
  {
    code: 'CFG',
    name: {
      en: 'Secure Configuration',
      az: 'Təhlükəsiz konfiqurasiya',
      ru: 'Безопасная конфигурация',
    },
  },
  {
    code: 'SD',
    name: {
      en: 'Secure Development',
      az: 'Təhlükəsiz proqramlaşdırma',
      ru: 'Безопасная разработка',
    },
  },
  {
    code: 'APP',
    name: {
      en: 'Application Security',
      az: 'Tətbiq təhlükəsizliyi',
      ru: 'Безопасность приложений',
    },
  },
  {
    code: 'DB',
    name: {
      en: 'Database Security',
      az: 'Verilənlər bazası təhlükəsizliyi',
      ru: 'Безопасность БД',
    },
  },
  {
    code: 'OPS',
    name: { en: 'IT Operations', az: 'İT əməliyyatları', ru: 'ИТ-эксплуатация' },
  },
  {
    code: 'CAP',
    name: { en: 'Capacity & Availability', az: 'Tutum və əlçatanlıq', ru: 'Ёмкость и доступность' },
  },
  {
    code: 'PRJ',
    name: { en: 'Project Governance', az: 'Layihə idarəçiliyi', ru: 'Управление проектами' },
  },
  {
    code: 'COM',
    name: {
      en: 'Compliance Obligations',
      az: 'Uyğunluq öhdəlikləri',
      ru: 'Комплаенс-обязательства',
    },
  },
  {
    code: 'PRV',
    name: { en: 'Privacy Governance', az: 'Məxfilik idarəetməsi', ru: 'Управление приватностью' },
  },
  {
    code: 'DLP',
    name: {
      en: 'Data Loss Prevention',
      az: 'Data sızmasının qarşısı',
      ru: 'Предотвращение утечек',
    },
  },
  {
    code: 'MOB',
    name: {
      en: 'Mobile & Remote Work',
      az: 'Mobil və uzaq iş',
      ru: 'Мобильная и удалённая работа',
    },
  },
  {
    code: 'AI',
    name: { en: 'AI Governance', az: 'İİ idarəetməsi', ru: 'Управление ИИ' },
  },
] as const;

export const GLOBAL_CONTROLS = [
  {
    ref: 'GOV-01',
    domain: 'GOV',
    objective: { en: 'Security policy governance' },
    question: {
      en: 'Is there an approved Information Security Policy that is reviewed at least annually and communicated to all staff?',
    },
  },
  {
    ref: 'GOV-02',
    domain: 'GOV',
    objective: { en: 'Roles & responsibilities' },
    question: {
      en: 'Are information-security roles and responsibilities formally defined and assigned (e.g. a RACI)?',
    },
  },
  {
    ref: 'GOV-03',
    domain: 'GOV',
    objective: { en: 'Risk management' },
    question: {
      en: 'Is a documented IT risk assessment performed at least annually with a maintained risk register?',
    },
  },
  {
    ref: 'AC-01',
    domain: 'AC',
    objective: { en: 'Least privilege / RBAC' },
    question: { en: 'Is access granted on a least-privilege, role-based basis?' },
  },
  {
    ref: 'AC-02',
    domain: 'AC',
    objective: { en: 'Access recertification' },
    question: { en: 'Are user access rights reviewed / recertified periodically?' },
  },
  {
    ref: 'AC-03',
    domain: 'AC',
    objective: { en: 'Multi-factor authentication' },
    question: { en: 'Is MFA enforced for remote, administrative and critical-application access?' },
  },
  {
    ref: 'AC-04',
    domain: 'AC',
    objective: { en: 'Account hygiene' },
    question: {
      en: 'Are password policies enforced and default / generic / shared accounts prohibited?',
    },
  },
  {
    ref: 'AC-05',
    domain: 'AC',
    objective: { en: 'Joiner-Mover-Leaver' },
    question: {
      en: 'Is there a formal JML process ensuring timely provisioning and de-provisioning?',
    },
  },
  {
    ref: 'CM-01',
    domain: 'CM',
    objective: { en: 'Change control' },
    question: {
      en: 'Are production changes authorised, tested and documented (CAB / change process)?',
    },
  },
  {
    ref: 'CM-02',
    domain: 'CM',
    objective: { en: 'Environment segregation' },
    question: { en: 'Are development, test and production environments segregated?' },
  },
  {
    ref: 'BK-01',
    domain: 'BK',
    objective: { en: 'Backup execution' },
    question: {
      en: 'Are backups performed per policy, encrypted, and stored offsite / immutable?',
    },
  },
  {
    ref: 'BK-02',
    domain: 'BK',
    objective: { en: 'Restore testing' },
    question: { en: 'Are backup restorations tested periodically to verify recoverability?' },
  },
  {
    ref: 'DR-01',
    domain: 'DR',
    objective: { en: 'DR / BCP plan' },
    question: {
      en: 'Is there a documented DR/BCP plan with defined RTO/RPO, tested at least annually?',
    },
  },
  {
    ref: 'NW-01',
    domain: 'NW',
    objective: { en: 'Segmentation' },
    question: {
      en: 'Is the network segmented (VLANs / DMZ) with sensitive environments isolated?',
    },
  },
  {
    ref: 'NW-02',
    domain: 'NW',
    objective: { en: 'Firewall governance' },
    question: { en: 'Are firewall rule-sets documented and reviewed at least every 6 months?' },
  },
  {
    ref: 'NW-03',
    domain: 'NW',
    objective: { en: 'Remote access exposure' },
    question: {
      en: 'Is remote administrative access restricted, brokered and logged (no direct internet exposure)?',
    },
  },
  {
    ref: 'VM-01',
    domain: 'VM',
    objective: { en: 'Patch management' },
    question: { en: 'Are systems patched within defined SLAs based on severity?' },
  },
  {
    ref: 'VM-02',
    domain: 'VM',
    objective: { en: 'Testing coverage' },
    question: { en: 'Are regular vulnerability scans and periodic penetration tests conducted?' },
  },
  {
    ref: 'EP-01',
    domain: 'EP',
    objective: { en: 'Endpoint protection' },
    question: {
      en: 'Is EDR / anti-malware deployed on all endpoints and servers with central management?',
    },
  },
  {
    ref: 'EP-02',
    domain: 'EP',
    objective: { en: 'Removable media' },
    question: { en: 'Are removable-media and data-transfer channels controlled?' },
  },
  {
    ref: 'LM-01',
    domain: 'LM',
    objective: { en: 'Centralised logging' },
    question: {
      en: 'Are security-relevant events centrally collected (SIEM) and retained per policy?',
    },
  },
  {
    ref: 'LM-02',
    domain: 'LM',
    objective: { en: 'Detection & response' },
    question: { en: 'Are security alerts monitored and triaged (24/7 or defined coverage)?' },
  },
  {
    ref: 'DP-01',
    domain: 'DP',
    objective: { en: 'Encryption' },
    question: {
      en: 'Is sensitive data encrypted at rest and in transit (incl. cardholder / PII)?',
    },
  },
  {
    ref: 'DP-02',
    domain: 'DP',
    objective: { en: 'Data classification' },
    question: { en: 'Is data classified and handled according to a classification scheme?' },
  },
  {
    ref: 'TP-01',
    domain: 'TP',
    objective: { en: 'Vendor risk' },
    question: {
      en: 'Are third parties risk-assessed and bound by security & data-protection obligations?',
    },
  },
  {
    ref: 'IR-01',
    domain: 'IR',
    objective: { en: 'IR plan & testing' },
    question: {
      en: 'Is there a documented, tested incident-response plan with defined roles and contacts?',
    },
  },
  {
    ref: 'IR-02',
    domain: 'IR',
    objective: { en: 'Reporting obligations' },
    question: {
      en: 'Are incidents logged, classified and reported to regulators / stakeholders as required?',
    },
  },
  {
    ref: 'AM-01',
    domain: 'AM',
    objective: { en: 'Asset inventory' },
    question: {
      en: 'Is there a complete, current inventory of hardware and software assets with owners?',
    },
  },
  {
    ref: 'CL-01',
    domain: 'CL',
    objective: { en: 'Cloud configuration' },
    question: {
      en: 'Are cloud environments hardened to a benchmark (e.g. CIS) and monitored for misconfiguration?',
    },
  },
  {
    ref: 'PH-01',
    domain: 'PH',
    objective: { en: 'Physical access' },
    question: {
      en: 'Are server rooms / data centres access-controlled, logged and monitored (CCTV)?',
    },
  },
  {
    ref: 'SA-01',
    domain: 'SA',
    objective: { en: 'Training & phishing' },
    question: {
      en: 'Is security-awareness training delivered and are phishing simulations run periodically?',
    },
  },
  {
    ref: 'ORG-01',
    domain: 'ORG',
    objective: { en: 'IT ownership model' },
    question: {
      en: 'Are IT ownership, accountability and escalation paths documented for all critical services?',
    },
  },
  {
    ref: 'RM-01',
    domain: 'RM',
    objective: { en: 'Risk methodology' },
    question: {
      en: 'Is the IT risk methodology defined, approved and consistently used across business units?',
    },
  },
  {
    ref: 'HR-01',
    domain: 'HR',
    objective: { en: 'People security lifecycle' },
    question: {
      en: 'Are screening, onboarding, transfer and termination controls applied based on role risk?',
    },
  },
  {
    ref: 'CR-01',
    domain: 'CR',
    objective: { en: 'Cryptographic key control' },
    question: {
      en: 'Are cryptographic keys inventoried, rotated, access-controlled and protected from unauthorized disclosure?',
    },
  },
  {
    ref: 'CFG-01',
    domain: 'CFG',
    objective: { en: 'Secure baselines' },
    question: {
      en: 'Are secure configuration baselines defined, monitored and remediated for servers, endpoints and cloud assets?',
    },
  },
  {
    ref: 'SD-01',
    domain: 'SD',
    objective: { en: 'Secure SDLC' },
    question: {
      en: 'Are security requirements, code review and security testing embedded into the software development lifecycle?',
    },
  },
  {
    ref: 'APP-01',
    domain: 'APP',
    objective: { en: 'Application control testing' },
    question: {
      en: 'Are critical applications tested for authentication, authorization, input validation and session-management weaknesses?',
    },
  },
  {
    ref: 'DB-01',
    domain: 'DB',
    objective: { en: 'Database protection' },
    question: {
      en: 'Are production databases access-controlled, encrypted, monitored and backed up according to criticality?',
    },
  },
  {
    ref: 'OPS-01',
    domain: 'OPS',
    objective: { en: 'Operational procedures' },
    question: {
      en: 'Are daily IT operations, job monitoring, batch failures and privileged operational activities formally controlled?',
    },
  },
  {
    ref: 'CAP-01',
    domain: 'CAP',
    objective: { en: 'Capacity monitoring' },
    question: {
      en: 'Are capacity, performance and availability thresholds monitored with documented response procedures?',
    },
  },
  {
    ref: 'PRJ-01',
    domain: 'PRJ',
    objective: { en: 'Project risk governance' },
    question: {
      en: 'Do technology projects track security, compliance and operational risks before go-live?',
    },
  },
  {
    ref: 'COM-01',
    domain: 'COM',
    objective: { en: 'Regulatory obligation tracking' },
    question: {
      en: 'Are applicable IT, security and data-protection obligations mapped to controls and reviewed for changes?',
    },
  },
  {
    ref: 'PRV-01',
    domain: 'PRV',
    objective: { en: 'Privacy control governance' },
    question: {
      en: 'Are privacy obligations, processing purposes, retention rules and data subject rights operationally controlled?',
    },
  },
  {
    ref: 'DLP-01',
    domain: 'DLP',
    objective: { en: 'Data leakage controls' },
    question: {
      en: 'Are sensitive-data egress channels monitored and controlled to prevent unauthorized disclosure?',
    },
  },
  {
    ref: 'MOB-01',
    domain: 'MOB',
    objective: { en: 'Remote and mobile access' },
    question: {
      en: 'Are mobile devices, remote workstations and VPN access managed with encryption, MFA and device compliance?',
    },
  },
  {
    ref: 'AI-01',
    domain: 'AI',
    objective: { en: 'AI use governance' },
    question: {
      en: 'Are AI tools approved, risk-assessed and restricted from processing confidential client data without authorization?',
    },
  },
] as const;
