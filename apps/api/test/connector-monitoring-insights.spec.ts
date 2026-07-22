import { describe, expect, it } from 'vitest';
import { buildMonitoringInsights } from '../src/connectors/monitoring-insights';

describe('buildMonitoringInsights', () => {
  const scheduler = { connectorAutosyncEveryMinutes: 5, autoTestRunEveryMinutes: 60 };

  it('returns a clear loop when no review gates are open', () => {
    const insights = buildMonitoringInsights(
      { dueForSync: 0, errorConnectors: 0, failingAutomatedTests: 0 },
      scheduler,
    );

    expect(insights.status).toBe('clear');
    expect(insights.nextAction).toBe('monitoring-clear');
    expect(insights.loop.signals).toContain('evidence-rescan');
    expect(insights.loop.cadence).toEqual(scheduler);
  });

  it('prioritizes connector errors before due rescans and failing tests', () => {
    const insights = buildMonitoringInsights(
      { dueForSync: 2, errorConnectors: 1, failingAutomatedTests: 3 },
      scheduler,
    );

    expect(insights.status).toBe('needs-review');
    expect(insights.nextAction).toBe('connector-errors');
    expect(insights.gates.map((gate) => [gate.key, gate.severity, gate.count])).toEqual([
      ['connector-errors', 'blocker', 1],
      ['due-rescan', 'attention', 2],
      ['failing-auto-tests', 'review', 3],
    ]);
  });
});
