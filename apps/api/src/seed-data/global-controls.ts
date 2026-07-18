/**
 * Глобальная библиотека контролей (T-031, ADR-0016) — извлечена из шаблона
 * заказчика docs/client-templates/inbox/2026-07-18/IT_Audit_Checklist_Template.xlsx
 * (16 доменов + 31 демонстрационный контроль, EN; переводы AZ/RU — EP-I18N).
 * Ре-генерация — см. checklist-analysis.md; руками не редактировать.
 */

export const CONTROL_DOMAINS = [
  { code: 'GOV', name: { en: 'IT Governance' } },
  { code: 'AC', name: { en: 'Access Control' } },
  { code: 'CM', name: { en: 'Change Management' } },
  { code: 'BK', name: { en: 'Backup & Recovery' } },
  { code: 'DR', name: { en: 'Business Continuity' } },
  { code: 'NW', name: { en: 'Network Security' } },
  { code: 'VM', name: { en: 'Vulnerability Mgmt' } },
  { code: 'EP', name: { en: 'Endpoint Security' } },
  { code: 'LM', name: { en: 'Logging & Monitoring' } },
  { code: 'DP', name: { en: 'Data Protection' } },
  { code: 'TP', name: { en: 'Third-Party / Vendor' } },
  { code: 'IR', name: { en: 'Incident Management' } },
  { code: 'AM', name: { en: 'Asset Management' } },
  { code: 'CL', name: { en: 'Cloud Security' } },
  { code: 'PH', name: { en: 'Physical Security' } },
  { code: 'SA', name: { en: 'Security Awareness' } },
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
] as const;
