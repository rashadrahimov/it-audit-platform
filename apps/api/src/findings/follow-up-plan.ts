export type FollowUpStatus =
  'identified' | 'assigned' | 'in_progress' | 'remediated' | 'pending_retest' | 'closed';

export interface FollowUpFindingInput {
  id: string;
  title: string;
  riskRating: string;
  status: string;
  slaStatus: string | null;
  dueDate: string | null;
  owner: string | null;
  auditor: string | null;
}

export interface FollowUpFindingItem extends FollowUpFindingInput {
  nextAction:
    'assign_owner' | 'remediate_gap' | 'collect_retest_evidence' | 'auditor_retest' | 'monitor';
  lane: 'remediation' | 'retest' | 'monitor';
  priorityScore: number;
  daysUntilDue: number | null;
  daysPastDue: number | null;
}

export interface FindingFollowUpPlan {
  generatedAt: string;
  summary: {
    openFindings: number;
    remediationQueue: number;
    readyForRetest: number;
    overdue: number;
    dueSoon: number;
    unassigned: number;
  };
  lanes: {
    remediation: FollowUpFindingItem[];
    retest: FollowUpFindingItem[];
    monitor: FollowUpFindingItem[];
  };
}

const RISK_WEIGHT: Record<string, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
  not_applicable: 0,
};

const STATUS_WEIGHT: Record<string, number> = {
  pending_retest: 80,
  remediated: 70,
  in_progress: 50,
  assigned: 40,
  identified: 30,
};

function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function dayDelta(dueDate: string | null, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((utcDay(due) - utcDay(now)) / 86_400_000);
}

function nextAction(row: FollowUpFindingInput): FollowUpFindingItem['nextAction'] {
  if (!row.owner && ['identified', 'assigned', 'in_progress'].includes(row.status)) {
    return 'assign_owner';
  }
  if (row.status === 'remediated') return 'collect_retest_evidence';
  if (row.status === 'pending_retest') return 'auditor_retest';
  if (['identified', 'assigned', 'in_progress'].includes(row.status)) return 'remediate_gap';
  return 'monitor';
}

function laneOf(row: FollowUpFindingInput): FollowUpFindingItem['lane'] {
  if (['remediated', 'pending_retest'].includes(row.status)) return 'retest';
  if (['identified', 'assigned', 'in_progress'].includes(row.status)) return 'remediation';
  return 'monitor';
}

function priorityScore(row: FollowUpFindingInput, delta: number | null): number {
  const dueWeight =
    delta === null ? 0 : delta < 0 ? 200 + Math.min(Math.abs(delta), 90) : Math.max(0, 60 - delta);
  const ownerWeight = row.owner ? 0 : 35;
  return (
    (RISK_WEIGHT[row.riskRating] ?? 50) + (STATUS_WEIGHT[row.status] ?? 0) + dueWeight + ownerWeight
  );
}

export function buildFindingFollowUpPlan(
  rows: FollowUpFindingInput[],
  now = new Date(),
): FindingFollowUpPlan {
  const openRows = rows.filter((row) => row.status !== 'closed');
  const items = openRows.map((row) => {
    const delta = dayDelta(row.dueDate, now);
    const item: FollowUpFindingItem = {
      ...row,
      nextAction: nextAction(row),
      lane: laneOf(row),
      priorityScore: priorityScore(row, delta),
      daysUntilDue: delta !== null && delta >= 0 ? delta : null,
      daysPastDue: delta !== null && delta < 0 ? Math.abs(delta) : null,
    };
    return item;
  });
  const byPriority = (a: FollowUpFindingItem, b: FollowUpFindingItem) =>
    b.priorityScore - a.priorityScore || a.title.localeCompare(b.title);

  return {
    generatedAt: now.toISOString(),
    summary: {
      openFindings: openRows.length,
      remediationQueue: items.filter((item) => item.lane === 'remediation').length,
      readyForRetest: items.filter((item) => item.lane === 'retest').length,
      overdue: items.filter((item) => item.slaStatus === 'overdue' || item.daysPastDue !== null)
        .length,
      dueSoon: items.filter((item) => item.slaStatus === 'due_soon').length,
      unassigned: items.filter((item) => !item.owner).length,
    },
    lanes: {
      remediation: items
        .filter((item) => item.lane === 'remediation')
        .sort(byPriority)
        .slice(0, 8),
      retest: items
        .filter((item) => item.lane === 'retest')
        .sort(byPriority)
        .slice(0, 8),
      monitor: items
        .filter((item) => item.lane === 'monitor')
        .sort(byPriority)
        .slice(0, 8),
    },
  };
}
