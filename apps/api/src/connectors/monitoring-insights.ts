export interface MonitoringInsightCounts {
  dueForSync: number;
  errorConnectors: number;
  failingAutomatedTests: number;
}

export interface MonitoringInsightScheduler {
  connectorAutosyncEveryMinutes: number;
  autoTestRunEveryMinutes: number;
}

export function buildMonitoringInsights(
  counts: MonitoringInsightCounts,
  scheduler: MonitoringInsightScheduler,
) {
  const gates = [
    {
      key: 'connector-errors',
      severity: counts.errorConnectors > 0 ? 'blocker' : 'ok',
      count: counts.errorConnectors,
      action: 'Review failed connector sync runs before trusting imported evidence.',
    },
    {
      key: 'due-rescan',
      severity: counts.dueForSync > 0 ? 'attention' : 'ok',
      count: counts.dueForSync,
      action: 'Run due connector rescans to refresh inventories, access and vulnerability signals.',
    },
    {
      key: 'failing-auto-tests',
      severity: counts.failingAutomatedTests > 0 ? 'review' : 'ok',
      count: counts.failingAutomatedTests,
      action: 'Auditor reviews failing automated control tests before promoting findings.',
    },
  ] as const;

  const nextAction = gates.find((gate) => gate.severity !== 'ok')?.key ?? 'monitoring-clear';

  return {
    status: nextAction === 'monitoring-clear' ? 'clear' : 'needs-review',
    nextAction,
    gates,
    loop: {
      signals: ['connector-autosync', 'automated-tests', 'evidence-rescan', 'ai-drl'],
      cadence: {
        connectorAutosyncEveryMinutes: scheduler.connectorAutosyncEveryMinutes,
        autoTestRunEveryMinutes: scheduler.autoTestRunEveryMinutes,
      },
      draftPolicy:
        'Automation can create signals and draft queues; auditors accept, edit or reject before evidence and findings become official.',
    },
  };
}
