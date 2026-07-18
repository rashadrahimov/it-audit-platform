import { BadRequestException, Injectable } from '@nestjs/common';
import { isNull, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { control, device, finding, risk, test as testTable, vendor } from '../db/schema';

/** Именованные метрики дашбордов/снапшотов (T-072, B9). Ключ → агрегат по живым данным. */
export const METRIC_NAMES = [
  'findings_by_status',
  'findings_by_severity',
  'tests_by_status',
  'vendors_by_risk',
  'risks_by_class',
  'devices_compliance',
  'controls_total',
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

type Breakdown = Record<string, number>;

@Injectable()
export class MetricsService {
  constructor(private readonly dbService: DbService) {}

  isKnown(name: string): name is MetricName {
    return (METRIC_NAMES as readonly string[]).includes(name);
  }

  /** Посчитать одну метрику (breakdown по группе или {total}). */
  async compute(tenantId: string, name: string): Promise<Breakdown> {
    if (!this.isKnown(name)) throw new BadRequestException(`Неизвестная метрика: ${name}`);
    return this.dbService.withTenant(tenantId, async (tx) => {
      switch (name) {
        case 'findings_by_status':
          return groupCount(
            await tx
              .select({ k: finding.status, c: sql<number>`count(*)::int` })
              .from(finding)
              .where(isNull(finding.deletedAt))
              .groupBy(finding.status),
          );
        case 'findings_by_severity':
          return groupCount(
            await tx
              .select({ k: finding.riskRating, c: sql<number>`count(*)::int` })
              .from(finding)
              .where(isNull(finding.deletedAt))
              .groupBy(finding.riskRating),
          );
        case 'tests_by_status':
          return groupCount(
            await tx
              .select({ k: testTable.status, c: sql<number>`count(*)::int` })
              .from(testTable)
              .where(isNull(testTable.deletedAt))
              .groupBy(testTable.status),
          );
        case 'vendors_by_risk':
          return groupCount(
            await tx
              .select({ k: vendor.inherentRisk, c: sql<number>`count(*)::int` })
              .from(vendor)
              .where(isNull(vendor.deletedAt))
              .groupBy(vendor.inherentRisk),
          );
        case 'risks_by_class':
          return groupCount(
            await tx
              .select({ k: risk.riskClass, c: sql<number>`count(*)::int` })
              .from(risk)
              .where(isNull(risk.deletedAt))
              .groupBy(risk.riskClass),
          );
        case 'devices_compliance':
          return groupCount(
            await tx
              .select({ k: device.complianceStatus, c: sql<number>`count(*)::int` })
              .from(device)
              .where(isNull(device.deletedAt))
              .groupBy(device.complianceStatus),
          );
        case 'controls_total': {
          const [row] = await tx
            .select({ c: sql<number>`count(*)::int` })
            .from(control)
            .where(isNull(control.deletedAt));
          return { total: row?.c ?? 0 };
        }
      }
    });
  }

  /** Посчитать все метрики (для снапшота T-073). */
  async computeAll(tenantId: string): Promise<Record<MetricName, Breakdown>> {
    const out = {} as Record<MetricName, Breakdown>;
    for (const name of METRIC_NAMES) {
      out[name] = await this.compute(tenantId, name);
    }
    return out;
  }
}

function groupCount(rows: Array<{ k: string | null; c: number }>): Breakdown {
  const out: Breakdown = {};
  for (const r of rows) out[r.k ?? 'unset'] = r.c;
  return out;
}
