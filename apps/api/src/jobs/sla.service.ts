import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { tenant } from '../db/schema';
import { env } from '../env';

export interface SlaRecalcResult {
  findings: number;
  tests: number;
  deprovisioning: number;
  vulnerabilities: number;
  commitments: number;
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
    // T-V32: per-tenant окно due_soon из settings.sla.dueSoonDays (fallback env)
    const tenants = await this.dbService.db
      .select({ id: tenant.id, settings: tenant.settings })
      .from(tenant);
    const totals: SlaRecalcResult = {
      findings: 0,
      tests: 0,
      deprovisioning: 0,
      vulnerabilities: 0,
      commitments: 0,
    };
    for (const t of tenants) {
      const sla =
        t.settings && typeof t.settings === 'object'
          ? ((t.settings as Record<string, unknown>).sla as { dueSoonDays?: number } | undefined)
          : undefined;
      const dueSoon =
        typeof sla?.dueSoonDays === 'number' && sla.dueSoonDays > 0
          ? Math.round(sla.dueSoonDays)
          : env.slaDueSoonDays;
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
        const deprov = await tx.execute(sql`
          UPDATE "deprovisioning_task" SET "sla_status" = CASE
            WHEN "due_date" < now() THEN 'overdue'
            WHEN "due_date" < now() + make_interval(days => ${dueSoon}) THEN 'due_soon'
            ELSE 'ok' END
          WHERE "completed_at" IS NULL AND "due_date" IS NOT NULL AND "status" = 'open'
        `);
        const vulns = await tx.execute(sql`
          UPDATE "vulnerability" SET "sla_status" = CASE
            WHEN "due_date" < now() THEN 'overdue'
            WHEN "due_date" < now() + make_interval(days => ${dueSoon}) THEN 'due_soon'
            ELSE 'ok' END
          WHERE "deleted_at" IS NULL AND "due_date" IS NOT NULL AND "status" <> 'resolved'
        `);
        const commitments = await tx.execute(sql`
          UPDATE "commitment" SET "sla_status" = CASE
            WHEN "due_date" < now() THEN 'overdue'
            WHEN "due_date" < now() + make_interval(days => ${dueSoon}) THEN 'due_soon'
            ELSE 'ok' END
          WHERE "deleted_at" IS NULL AND "due_date" IS NOT NULL AND "status" <> 'met'
        `);
        totals.findings += findings.rowCount ?? 0;
        totals.tests += tests.rowCount ?? 0;
        totals.deprovisioning += deprov.rowCount ?? 0;
        totals.vulnerabilities += vulns.rowCount ?? 0;
        totals.commitments += commitments.rowCount ?? 0;
      });
    }
    return totals;
  }
}
