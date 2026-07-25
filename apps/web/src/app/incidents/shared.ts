/** Общие типы и тон-мапы экранов инцидентов (T-IR06, EP-INC). */

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STATUSES = [
  'detected',
  'triaged',
  'contained',
  'eradicated',
  'recovered',
  'closed',
] as const;
export type Status = (typeof STATUSES)[number];

export const CATEGORIES = [
  'malware',
  'phishing',
  'vulnerability',
  'misconfiguration',
  'unauthorized_access',
  'data_breach',
  'service_outage',
  'insider',
  'physical',
  'other',
] as const;

export const LINK_TYPES = [
  'security_alert',
  'vulnerability',
  'asset',
  'device',
  'risk',
  'control',
  'vendor',
  'finding',
] as const;

export interface Incident {
  id: string;
  ref: string;
  title: string;
  severity: Severity;
  status: Status;
  category: string | null;
  source: string;
  commanderMembershipId: string | null;
  commanderName: string | null;
  detectedAt: string;
  dueDate: string | null;
  slaStatus: string;
  reportable: boolean;
  notifyStatus: string;
}

export interface IncidentDetail extends Incident {
  description: string | null;
  phases: Record<string, string | null>;
  allowedTransitions: Status[];
  links: Array<{ linkId: string; entityType: string; entityId: string; title: string | null }>;
  timeline: Array<{
    id: string;
    kind: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    authorName: string | null;
    at: string;
  }>;
  notification: {
    reportable: boolean;
    regulator: string | null;
    deadlineAt: string | null;
    notifiedAt: string | null;
    note: string | null;
    status: string;
  };
  postmortem: {
    rootCause: string | null;
    impactSummary: string | null;
    lessonsLearned: string | null;
    savedAt: string | null;
    available: boolean;
  };
}

/** Шкала severity — красный только для critical, чтобы «горит» читалось однозначно. */
export const SEV_TONE: Record<Severity, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

/** Фазы реагирования: от «обнаружено» к «закрыто» — насыщенность падает к финалу. */
export const STATUS_TONE: Record<Status, string> = {
  detected: 'bg-red-100 text-red-700',
  triaged: 'bg-orange-100 text-orange-700',
  contained: 'bg-amber-100 text-amber-700',
  eradicated: 'bg-emerald-100 text-emerald-700',
  recovered: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-muted text-secondary',
};

export const SLA_TONE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  due_later: 'bg-muted text-secondary',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

export const NOTIFY_TONE: Record<string, string> = {
  not_required: 'bg-muted text-secondary',
  notified: 'bg-emerald-100 text-emerald-700',
  ok: 'bg-muted text-secondary',
  no_deadline: 'bg-muted text-secondary',
  due_soon: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
};

export const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export const btnCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export const btnGhostCls =
  'rounded-md border border-border px-3 py-2 text-sm font-medium text-primary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
