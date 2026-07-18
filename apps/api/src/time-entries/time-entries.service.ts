import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { engagement, membership, timeEntry } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      date: string;
      hours: number;
      engagementId?: string;
      phase?: string;
      category?: string;
      billableRate?: number;
      note?: string;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [me] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
      if (!me) throw new BadRequestException('Нет membership в тенанте');
      const [row] = await tx
        .insert(timeEntry)
        .values({
          tenantId: actor.tenantId,
          membershipId: me.id,
          engagementId: input.engagementId ?? null,
          date: new Date(input.date),
          hours: input.hours.toFixed(2),
          phase: input.phase ?? null,
          category: input.category ?? 'audit',
          billableRate: input.billableRate !== undefined ? input.billableRate.toFixed(2) : null,
          note: input.note ?? null,
        })
        .returning();
      if (!row) throw new Error('Тайм-запись не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'time_entry.created',
      entityType: 'time_entry',
      entityId: created.id,
      after: { hours: created.hours, category: created.category },
    });
    return { id: created.id, hours: Number(created.hours) };
  }

  async list(tenantId: string, engagementId?: string) {
    return this.dbService.withTenant(tenantId, (tx) => {
      const conds: SQL[] = [isNull(timeEntry.deletedAt)];
      if (engagementId) conds.push(eq(timeEntry.engagementId, engagementId));
      return tx
        .select({
          id: timeEntry.id,
          date: timeEntry.date,
          hours: timeEntry.hours,
          phase: timeEntry.phase,
          category: timeEntry.category,
          engagementId: timeEntry.engagementId,
        })
        .from(timeEntry)
        .where(and(...conds))
        .orderBy(desc(timeEntry.date));
    }).then((rows) => rows.map((r) => ({ ...r, hours: Number(r.hours) })));
  }

  /** Задать бюджет часов на engagement (T-089, UNI-07). */
  async setBudget(actor: Actor, engagementId: string, budgetedHours: number) {
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagement.id })
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);
      await tx
        .update(engagement)
        .set({ budgetedHours: budgetedHours.toFixed(2) })
        .where(eq(engagement.id, engagementId));
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'engagement.budget_set',
      entityType: 'engagement',
      entityId: engagementId,
      after: { budgetedHours },
    });
    return { engagementId, budgetedHours };
  }

  /** Бюджет vs факт: агрегат факт-часов по фазе/категории + variance (T-089, UNI-07). */
  async summary(tenantId: string, engagementId: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagement.id, budgetedHours: engagement.budgetedHours })
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);

      const byPhaseRows = await tx
        .select({ k: timeEntry.phase, sum: sql<string>`coalesce(sum(${timeEntry.hours}), 0)` })
        .from(timeEntry)
        .where(and(eq(timeEntry.engagementId, engagementId), isNull(timeEntry.deletedAt)))
        .groupBy(timeEntry.phase);
      const byCatRows = await tx
        .select({ k: timeEntry.category, sum: sql<string>`coalesce(sum(${timeEntry.hours}), 0)` })
        .from(timeEntry)
        .where(and(eq(timeEntry.engagementId, engagementId), isNull(timeEntry.deletedAt)))
        .groupBy(timeEntry.category);

      const byPhase: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      let actual = 0;
      for (const r of byPhaseRows) byPhase[r.k ?? 'unset'] = Number(r.sum);
      for (const r of byCatRows) {
        byCategory[r.k ?? 'unset'] = Number(r.sum);
        actual += Number(r.sum);
      }
      const budgeted = eng.budgetedHours !== null ? Number(eng.budgetedHours) : null;
      return {
        engagementId,
        budgeted,
        actual,
        variance: budgeted !== null ? Number((budgeted - actual).toFixed(2)) : null,
        byPhase,
        byCategory,
      };
    });
  }
}
