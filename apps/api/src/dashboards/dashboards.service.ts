import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
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

/**
 * T-V21: preset-дашборды «из коробки» (Vanta-паритет). Создаются лениво при
 * первом просмотре списка, если у тенанта ещё НИКОГДА не было дашбордов.
 */
export const PRESET_DASHBOARDS: Array<{ name: string; widgets: Widget[] }> = [
  {
    name: 'Program overview',
    widgets: [
      { metric: 'controls_total', chartType: 'number', title: 'Controls' },
      { metric: 'tests_passing', chartType: 'bar', title: 'Tests passing (manual/automated)' },
      { metric: 'documents_readiness', chartType: 'donut', title: 'Documents readiness' },
      { metric: 'findings_by_status', chartType: 'bar', title: 'Findings by status' },
    ],
  },
  {
    name: 'Issues report',
    widgets: [
      { metric: 'findings_by_severity', chartType: 'pie', title: 'Findings by severity' },
      { metric: 'findings_by_status', chartType: 'bar', title: 'Findings by status' },
      { metric: 'risks_by_class', chartType: 'bar', title: 'Risks by class' },
      { metric: 'risks_by_treatment', chartType: 'donut', title: 'Risks by treatment' },
    ],
  },
  {
    name: 'Vendors report',
    widgets: [
      { metric: 'vendors_by_risk', chartType: 'bar', title: 'Vendors by inherent risk' },
      { metric: 'vendors_by_category', chartType: 'pie', title: 'Vendors by category' },
      { metric: 'vendors_by_risk', chartType: 'number', title: 'Vendors total' },
    ],
  },
  {
    name: 'Customer trust report',
    widgets: [
      { metric: 'trust_requests', chartType: 'bar', title: 'Trust Center access requests' },
      { metric: 'questionnaires_by_status', chartType: 'donut', title: 'Questionnaires' },
      { metric: 'commitments_by_status', chartType: 'bar', title: 'Commitments' },
    ],
  },
];

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

  /** T-V15: правка дашборда (имя и/или полный набор виджетов). */
  async update(actor: Actor, id: string, input: { name?: string; widgets?: Widget[] }) {
    if (input.widgets) {
      for (const w of input.widgets) {
        if (!this.metricsService.isKnown(w.metric)) {
          throw new BadRequestException(`Неизвестная метрика виджета: ${w.metric}`);
        }
      }
    }
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: dashboard.id })
        .from(dashboard)
        .where(and(eq(dashboard.id, id), isNull(dashboard.deletedAt)));
      if (!row) throw new NotFoundException(`Дашборд ${id} не найден`);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.widgets !== undefined) patch.widgets = input.widgets;
      const [res] = await tx.update(dashboard).set(patch).where(eq(dashboard.id, id)).returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'dashboard.updated',
      entityType: 'dashboard',
      entityId: id,
      after: { name: updated.name, widgets: (updated.widgets as Widget[]).length },
    });
    return { id: updated.id, name: updated.name };
  }

  /** T-V15: soft delete дашборда. */
  async remove(actor: Actor, id: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: dashboard.id, name: dashboard.name })
        .from(dashboard)
        .where(and(eq(dashboard.id, id), isNull(dashboard.deletedAt)));
      if (!row) throw new NotFoundException(`Дашборд ${id} не найден`);
      await tx.update(dashboard).set({ deletedAt: new Date() }).where(eq(dashboard.id, id));
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'dashboard.deleted',
      entityType: 'dashboard',
      entityId: id,
      before: { name: removed.name },
    });
    return { deleted: true };
  }

  /**
   * T-V21: идемпотентный сид пресетов — только если у тенанта никогда не было
   * дашбордов (вкл. удалённые: осознанно удалённые пресеты не возвращаются).
   */
  async ensurePresets(tenantId: string) {
    await this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx.select({ c: sql<number>`count(*)::int` }).from(dashboard);
      if ((row?.c ?? 0) > 0) return;
      for (const preset of PRESET_DASHBOARDS) {
        await tx.insert(dashboard).values({ tenantId, name: preset.name, widgets: preset.widgets });
      }
    });
  }

  async list(tenantId: string) {
    await this.ensurePresets(tenantId);
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
