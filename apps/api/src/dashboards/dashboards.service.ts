import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { dashboard } from '../db/schema';
import { MetricsService } from './metrics.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface Widget {
  metric: string;
  chartType: string;
  title?: string;
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly metricsService: MetricsService,
  ) {}

  async create(actor: Actor, input: { name: string; widgets: Widget[] }) {
    for (const w of input.widgets) {
      if (!this.metricsService.isKnown(w.metric)) {
        throw new BadRequestException(`Неизвестная метрика виджета: ${w.metric}`);
      }
    }
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(dashboard)
        .values({ tenantId: actor.tenantId, name: input.name, widgets: input.widgets })
        .returning();
      if (!row) throw new Error('Дашборд не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'dashboard.created',
      entityType: 'dashboard',
      entityId: created.id,
      after: { name: created.name, widgets: input.widgets.length },
    });
    return { id: created.id, name: created.name };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: dashboard.id, name: dashboard.name, widgets: dashboard.widgets })
        .from(dashboard)
        .where(isNull(dashboard.deletedAt))
        .orderBy(desc(dashboard.createdAt)),
    );
    return rows.map((d) => ({ id: d.id, name: d.name, widgets: (d.widgets as Widget[]).length }));
  }

  /** Дашборд с посчитанными данными каждого виджета (B9). */
  async data(tenantId: string, id: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(dashboard)
        .where(and(eq(dashboard.id, id), isNull(dashboard.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Дашборд ${id} не найден`);
    const widgets = row.widgets as Widget[];
    const computed = [];
    for (const w of widgets) {
      computed.push({
        metric: w.metric,
        chartType: w.chartType,
        title: w.title ?? w.metric,
        data: await this.metricsService.compute(tenantId, w.metric),
      });
    }
    return { id: row.id, name: row.name, widgets: computed };
  }
}
