/** Навигация приложения (T-A16 → T-H28 app-shell). Общий источник для сайдбара и хаба. */
export interface NavItem {
  href: string;
  testid: string;
  label: string;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    group: 'overview',
    items: [
      { href: '/my-work', testid: 'go-my-work', label: 'myWorkNav' },
      { href: '/dashboard', testid: 'go-dashboard', label: 'dashboard' },
      { href: '/dashboards', testid: 'go-dashboards-charts', label: 'chartDashboards' },
      { href: '/reports', testid: 'go-reports', label: 'reports' },
      { href: '/snapshots', testid: 'go-snapshots', label: 'snapshots' },
      { href: '/trends', testid: 'go-trends', label: 'trends' },
      { href: '/kpi', testid: 'go-kpi', label: 'kpi' },
    ],
  },
  {
    group: 'compliance',
    items: [
      { href: '/frameworks', testid: 'go-frameworks', label: 'frameworks' },
      { href: '/controls', testid: 'go-controls', label: 'controls' },
      { href: '/tests', testid: 'go-tests', label: 'tests' },
      { href: '/policies', testid: 'go-policies', label: 'policies' },
      { href: '/documents', testid: 'go-documents', label: 'documents' },
      { href: '/commitments', testid: 'go-commitments', label: 'commitments' },
      { href: '/universe', testid: 'go-universe', label: 'universe' },
    ],
  },
  {
    group: 'engagements',
    items: [
      { href: '/engagements', testid: 'go-engagements', label: 'engagements' },
      { href: '/findings', testid: 'go-findings', label: 'findings' },
      { href: '/audit-programs', testid: 'go-audit-programs', label: 'auditPrograms' },
      { href: '/working-papers', testid: 'go-working-papers', label: 'workingPapers' },
      { href: '/plans', testid: 'go-plans', label: 'plans' },
      { href: '/allocations', testid: 'go-allocations', label: 'allocations' },
      { href: '/time', testid: 'go-time', label: 'time' },
      { href: '/satisfaction', testid: 'go-satisfaction', label: 'satisfaction' },
    ],
  },
  {
    group: 'risk',
    items: [
      { href: '/risks', testid: 'go-risks', label: 'risks' },
      { href: '/risk-heatmap', testid: 'go-risk-heatmap', label: 'riskHeatmap' },
      { href: '/privacy', testid: 'go-privacy', label: 'privacy' },
    ],
  },
  {
    group: 'security',
    items: [
      { href: '/iam', testid: 'go-iam', label: 'iam' },
      { href: '/access-reviews', testid: 'go-access-reviews', label: 'accessReviews' },
      { href: '/assets', testid: 'go-assets', label: 'assetsNav' },
      { href: '/devices', testid: 'go-devices', label: 'devices' },
      { href: '/security-alerts', testid: 'go-security-alerts', label: 'securityAlerts' },
      { href: '/vulnerabilities', testid: 'go-vulnerabilities', label: 'vulnerabilities' },
      { href: '/code-changes', testid: 'go-code-changes', label: 'codeChanges' },
    ],
  },
  {
    group: 'thirdParty',
    items: [
      { href: '/vendors', testid: 'go-vendors', label: 'vendors' },
      { href: '/trust-center', testid: 'go-trust-center', label: 'trustCenter' },
      { href: '/questionnaires', testid: 'go-questionnaires', label: 'questionnaires' },
      { href: '/knowledge-base', testid: 'go-knowledge-base', label: 'knowledgeBase' },
    ],
  },
  {
    group: 'org',
    items: [
      { href: '/personnel', testid: 'go-personnel', label: 'personnel' },
      { href: '/connectors', testid: 'go-connectors', label: 'connectors' },
      { href: '/config', testid: 'go-config', label: 'config' },
      { href: '/roles', testid: 'go-roles', label: 'rolesNav' },
      { href: '/members', testid: 'go-members', label: 'membersNav' },
      { href: '/field-permissions', testid: 'go-field-permissions', label: 'fieldPermissions' },
      { href: '/api-keys', testid: 'go-api-keys', label: 'apiKeys' },
      { href: '/notifications', testid: 'go-notifications', label: 'notifications' },
      { href: '/migration', testid: 'go-migration', label: 'migration' },
      { href: '/ai-settings', testid: 'go-ai-settings', label: 'aiSettings' },
      { href: '/glossary', testid: 'go-glossary', label: 'glossary' },
      { href: '/guide', testid: 'go-guide', label: 'guide' },
    ],
  },
];
