export const REQUIREMENT_COVERAGE = [
  {
    key: 'workflow',
    status: 'live',
    evidence: ['audit-charter', 'engagements', 'roadmap', 'domain-progress'],
  },
  {
    key: 'riskRegister',
    status: 'live',
    evidence: ['risks', 'business-risk-lens', 'ai-risk-suggestions', 'approval'],
  },
  {
    key: 'documentAi',
    status: 'live',
    evidence: [
      'evidence-grounded-findings',
      'ai-explainability',
      'document-ai-intake',
      'evidence-rescan-plan',
      'ocr-readiness',
    ],
  },
  {
    key: 'recommendations',
    status: 'live',
    evidence: ['findings', 'action-plan', 'tasks'],
  },
  {
    key: 'deliverables',
    status: 'live',
    evidence: ['pdf', 'docx', 'xlsx', 'az-en-ru'],
  },
  {
    key: 'trustSecurity',
    status: 'live',
    evidence: ['rbac', 'audit-log', 'ai-traceability', 'tenant-isolation', 'private-cloud'],
  },
  {
    key: 'collaboration',
    status: 'live',
    evidence: ['team', 'tasks', 'drl', 'evidence-requests'],
  },
  {
    key: 'integrations',
    status: 'live',
    evidence: ['api-v1', 'connectors', 'cross-framework-mapping'],
  },
  {
    key: 'reportingUx',
    status: 'live',
    evidence: ['dashboards', 'scheduled-delivery-plan', 'email-digest-worker', 'locales'],
  },
  {
    key: 'advancedAi',
    status: 'live',
    evidence: [
      'audit-query',
      'evidence-query',
      'auto-drl',
      'continuous-summary',
      'evidence-rescan-plan',
      'continuous-review-gates',
    ],
  },
] as const;
