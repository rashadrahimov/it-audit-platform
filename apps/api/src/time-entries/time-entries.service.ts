import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { membership, timeEntry } from '../db/schema';

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
}
