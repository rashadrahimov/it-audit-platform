import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { annualPlan, auditableEntity, planItem, risk, riskEntity } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Вес risk_class → priority (risk-based planning UNI-04). */
const CLASS_WEIGHT: Record<string, number> = { critical: 100, high: 60, medium: 30, low: 10 };

@Injectable()
export class PlansService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: { name: string; year?: number; capacityHours?: number }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(annualPlan)
        .values({
          tenantId: actor.tenantId,
          name: input.name,
          year: input.year ?? null,
          capacityHours: input.capacityHours !== undefined ? input.capacityHours.toFixed(2) : null,
        })
        .returning();
      if (!row) throw new Error('План не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'annual_plan.created',
      entityType: 'annual_plan',
      entityId: created.id,
      after: { name: created.name },
    });
    return { id: created.id, status: created.status };
  }

  /** Добавить узел universe в план: priority_score из макс. risk_class рисков узла. */
  async addItem(
    actor: Actor,
    planId: string,
    input: {
      auditableEntityId: string;
      plannedHours?: number;
      plannedQuarter?: string;
      recurrence?: unknown;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [plan] = await tx
        .select({ id: annualPlan.id })
        .from(annualPlan)
        .where(and(eq(annualPlan.id, planId), isNull(annualPlan.deletedAt)));
      if (!plan) throw new NotFoundException(`План ${planId} не найден`);
      const [node] = await tx
        .select({ id: auditableEntity.id })
        .from(auditableEntity)
        .where(
          and(eq(auditableEntity.id, input.auditableEntityId), isNull(auditableEntity.deletedAt)),
        );
      if (!node) throw new BadRequestException(`Узел ${input.auditableEntityId} не найден`);

      // риски, затрагивающие узел → макс класс → приоритет
      const risks = await tx
        .select({ riskClass: risk.riskClass })
        .from(riskEntity)
        .innerJoin(risk, eq(riskEntity.riskId, risk.id))
        .where(
          and(eq(riskEntity.auditableEntityId, input.auditableEntityId), isNull(risk.deletedAt)),
        );
      let maxWeight = 0;
      let topClass = 'none';
      for (const r of risks) {
        const w = CLASS_WEIGHT[r.riskClass ?? ''] ?? 0;
        if (w > maxWeight) {
          maxWeight = w;
          topClass = r.riskClass ?? 'none';
        }
      }
      const [row] = await tx
        .insert(planItem)
        .values({
          planId,
          auditableEntityId: input.auditableEntityId,
          priorityScore: maxWeight.toFixed(2),
          scoreBreakdown: { risks: risks.length, topClass, weight: maxWeight },
          plannedHours: input.plannedHours !== undefined ? input.plannedHours.toFixed(2) : null,
          plannedQuarter: input.plannedQuarter ?? null,
          recurrence: (input.recurrence as object) ?? null,
        })
        .returning();
      if (!row) throw new Error('Item не создался');
      return { id: row.id, priorityScore: Number(row.priorityScore), topClass };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'plan_item.added',
      entityType: 'annual_plan',
      entityId: planId,
      after: { priorityScore: created.priorityScore, topClass: created.topClass },
    });
    return created;
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [plan] = await tx
        .select()
        .from(annualPlan)
        .where(and(eq(annualPlan.id, id), isNull(annualPlan.deletedAt)));
      if (!plan) throw new NotFoundException(`План ${id} не найден`);
      const items = await tx
        .select({
          id: planItem.id,
          auditableEntityId: planItem.auditableEntityId,
          priorityScore: planItem.priorityScore,
          plannedHours: planItem.plannedHours,
          scoreBreakdown: planItem.scoreBreakdown,
          recurrence: planItem.recurrence,
        })
        .from(planItem)
        .where(eq(planItem.planId, id))
        .orderBy(desc(planItem.priorityScore));
      return {
        id: plan.id,
        name: plan.name,
        year: plan.year,
        capacityHours: plan.capacityHours !== null ? Number(plan.capacityHours) : null,
        status: plan.status,
        items: items.map((i) => ({
          id: i.id,
          auditableEntityId: i.auditableEntityId,
          priorityScore: Number(i.priorityScore),
          plannedHours: i.plannedHours !== null ? Number(i.plannedHours) : null,
          recurring: i.recurrence !== null,
          scoreBreakdown: i.scoreBreakdown,
        })),
      };
    });
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: annualPlan.id,
          name: annualPlan.name,
          year: annualPlan.year,
          status: annualPlan.status,
        })
        .from(annualPlan)
        .where(isNull(annualPlan.deletedAt))
        .orderBy(desc(annualPlan.createdAt)),
    );
    return rows;
  }

  /** Capacity: план по часам vs capacity (T-101, наша добавка). */
  async capacity(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [plan] = await tx
        .select({ capacityHours: annualPlan.capacityHours })
        .from(annualPlan)
        .where(and(eq(annualPlan.id, id), isNull(annualPlan.deletedAt)));
      if (!plan) throw new NotFoundException(`План ${id} не найден`);
      const [agg] = await tx
        .select({ planned: sql<string>`coalesce(sum(${planItem.plannedHours}), 0)` })
        .from(planItem)
        .where(eq(planItem.planId, id));
      const capacity = plan.capacityHours !== null ? Number(plan.capacityHours) : null;
      const planned = Number(agg?.planned ?? 0);
      return {
        planId: id,
        capacity,
        planned,
        remaining: capacity !== null ? Number((capacity - planned).toFixed(2)) : null,
        overallocated: capacity !== null && planned > capacity,
      };
    });
  }
}
