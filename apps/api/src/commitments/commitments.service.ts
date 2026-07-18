import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { commitment } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

const STATUSES = ['met', 'at_risk', 'breached'];

@Injectable()
export class CommitmentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      title: string;
      source?: string;
      description?: string;
      dueDate?: string;
      reviewCadence?: string;
      ownerMembershipId?: string;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(commitment)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          source: input.source ?? null,
          description: input.description ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          reviewCadence: input.reviewCadence ?? null,
          ownerMembershipId: input.ownerMembershipId ?? null,
        })
        .returning();
      if (!row) throw new Error('Обязательство не создалось');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'commitment.created',
      entityType: 'commitment',
      entityId: created.id,
      after: { title: created.title },
    });
    return { id: created.id, status: created.status };
  }

  async setStatus(actor: Actor, id: string, status: string) {
    if (!STATUSES.includes(status)) {
      throw new BadRequestException(`Недопустимый статус: ${status}`);
    }
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: commitment.status })
        .from(commitment)
        .where(and(eq(commitment.id, id), isNull(commitment.deletedAt)));
      if (!row) throw new NotFoundException(`Обязательство ${id} не найдено`);
      await tx.update(commitment).set({ status }).where(eq(commitment.id, id));
      return { before: row.status, after: status };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'commitment.status_changed',
      entityType: 'commitment',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(commitment)
        .where(isNull(commitment.deletedAt))
        .orderBy(desc(commitment.createdAt)),
    );
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      source: c.source,
      status: c.status,
      slaStatus: c.slaStatus,
      dueDate: c.dueDate,
    }));
  }
}
