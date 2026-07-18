import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { reportSnapshot } from '../db/schema';
import { MetricsService } from './metrics.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Снапшоты метрик (T-073, B10): заморозка состояния на дату, доказуемость «как было». */
@Injectable()
export class SnapshotsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly metricsService: MetricsService,
  ) {}

  async create(actor: Actor, label: string) {
    const metrics = await this.metricsService.computeAll(actor.tenantId);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(reportSnapshot)
        .values({ tenantId: actor.tenantId, label, metrics })
        .returning();
      if (!row) throw new Error('Снапшот не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'report_snapshot.created',
      entityType: 'report_snapshot',
      entityId: created.id,
      after: { label },
    });
    return { id: created.id, label: created.label, capturedAt: created.capturedAt };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: reportSnapshot.id,
          label: reportSnapshot.label,
          capturedAt: reportSnapshot.capturedAt,
        })
        .from(reportSnapshot)
        .orderBy(desc(reportSnapshot.capturedAt)),
    );
    return rows;
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(reportSnapshot).where(and(eq(reportSnapshot.id, id))),
    );
    if (!row) throw new NotFoundException(`Снапшот ${id} не найден`);
    return { id: row.id, label: row.label, capturedAt: row.capturedAt, metrics: row.metrics };
  }
}
