import { describe, expect, it } from 'vitest';
import { worstSla } from '../src/vulnerabilities/vulnerabilities.service';

describe('SLA status ordering', () => {
  it('keeps due_later distinct from ok in asset aggregates', () => {
    expect(worstSla(['ok', 'due_later'])).toBe('due_later');
  });

  it('prioritizes urgent statuses over due_later', () => {
    expect(worstSla(['due_later', 'due_soon'])).toBe('due_soon');
    expect(worstSla(['due_later', 'overdue'])).toBe('overdue');
  });

  it('returns ok when an asset has no open vulnerability SLA statuses', () => {
    expect(worstSla([])).toBe('ok');
  });
});
