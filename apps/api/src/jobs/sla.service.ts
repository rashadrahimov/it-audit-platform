import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { tenant } from '../db/schema';
import { env } from '../env';

export interface SlaRecalcResult {
  findings: number;
  tests: number;
}

/**
 * SLA-примитивы (T-043, B15): пересчёт sla_status (ok/due_soon/overdue) по
 * due_date для finding и test. Джоба системная, но рантайм ходит под RLS —
 * поэтому обходим тенанты через withTenant, а не одним запросом.
 */
@Injectable()
export class SlaService {
  constructor(private readonly dbService: DbService) {}

  async recalc(): Promise<SlaRecalcResult> {
    const tenants = await this.dbService.db.select({ id: tenant.id }).from(tenant);
    const totals: SlaRecalcResult = { findings: 0, tests: 0 };
    const dueSoon = env.slaDueSoonDays;
    for (const t of tenants) {
      await this.dbService.withTenant(t.id, async (tx) => {
        const findings = await tx.execute(sql`
          UPDATE "finding" SET "sla_status" = CASE
            WHEN "due_date" < now() THEN 'overdue'
            WHEN "due_date" < now() + make_interval(days => ${dueSoon}) THEN 'due_soon'
            ELSE 'ok' END
          WHERE "deleted_at" IS NULL AND "due_date" IS NOT NULL AND "status" <> 'closed'
        `);
        const tests = await tx.execute(sql`
          UPDATE "test" SET "sla_status" = CASE
            WHEN "due_date" < now() THEN 'overdue'
            WHEN "due_date" < now() + make_interval(days => ${dueSoon}) THEN 'due_soon'
            ELSE 'ok' END
          WHERE "deleted_at" IS NULL AND "due_date" IS NOT NULL AND "status" <> 'deactivated'
        `);
        totals.findings += findings.rowCount ?? 0;
        totals.tests += tests.rowCount ?? 0;
      });
    }
    return totals;
  }
}
