import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { engagement, resourceAllocation } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class AllocationsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: { engagementId: string; membershipId: string; allocatedHours: number; period?: string },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagement.id })
        .from(engagement)
        .where(and(eq(engagement.id, input.engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new BadRequestException(`Engagement ${input.engagementId} не найден`);
      const [row] = await tx
        .insert(resourceAllocation)
        .values({
          tenantId: actor.tenantId,
          engagementId: input.engagementId,
          membershipId: input.membershipId,
          allocatedHours: input.allocatedHours.toFixed(2),
          period: input.period ?? null,
        })
        .returning();
      if (!row) throw new Error('Аллокация не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'resource_allocation.created',
      entityType: 'resource_allocation',
      entityId: created.id,
      after: { membershipId: input.membershipId, allocatedHours: input.allocatedHours },
    });
    return { id: created.id };
  }

  /** Утилизация члена: sum(allocated) по всем engagement vs capacity (SCH-03). */
  async utilization(tenantId: string, membershipId: string, capacity: number) {
    const [agg] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ allocated: sql<string>`coalesce(sum(${resourceAllocation.allocatedHours}), 0)` })
        .from(resourceAllocation)
        .where(
          and(
            eq(resourceAllocation.membershipId, membershipId),
            isNull(resourceAllocation.deletedAt),
          ),
        ),
    );
    const allocated = Number(agg?.allocated ?? 0);
    return {
      membershipId,
      allocated,
      capacity,
      utilizationPct: capacity > 0 ? Math.round((allocated / capacity) * 100) : null,
      overallocated: capacity > 0 && allocated > capacity,
    };
  }
}
