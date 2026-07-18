import { describe, expect, it } from 'vitest';
import { deriveUtilization } from '../src/allocations/utilization';

/** DoD T-102/T-A25: утилизация участника vs capacity. Чистая функция, БД не нужна. */
describe('deriveUtilization', () => {
  it('процент округляется', () => {
    expect(deriveUtilization(40, 160)).toEqual({ utilizationPct: 25, overallocated: false });
    expect(deriveUtilization(1, 3)).toEqual({ utilizationPct: 33, overallocated: false }); // 33.33→33
    expect(deriveUtilization(2, 3)).toEqual({ utilizationPct: 67, overallocated: false }); // 66.67→67
  });

  it('ровно на ёмкости — не перегрузка, 100%', () => {
    expect(deriveUtilization(160, 160)).toEqual({ utilizationPct: 100, overallocated: false });
  });

  it('сверх ёмкости → overallocated, pct > 100', () => {
    expect(deriveUtilization(200, 160)).toEqual({ utilizationPct: 125, overallocated: true });
  });

  it('ноль назначено → 0%', () => {
    expect(deriveUtilization(0, 160)).toEqual({ utilizationPct: 0, overallocated: false });
  });

  it('capacity ≤ 0 → pct null, не перегрузка (нечего делить)', () => {
    expect(deriveUtilization(40, 0)).toEqual({ utilizationPct: null, overallocated: false });
    expect(deriveUtilization(0, 0)).toEqual({ utilizationPct: null, overallocated: false });
    expect(deriveUtilization(40, -5)).toEqual({ utilizationPct: null, overallocated: false });
  });
});
