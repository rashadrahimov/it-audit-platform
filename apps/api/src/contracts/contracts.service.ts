import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { contract } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** T-V31: контракты с контрагентами; commitments привязываются к контракту. */
@Injectable()
export class ContractsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      name: string;
      counterparty?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      note?: string;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(contract)
        .values({
          tenantId: actor.tenantId,
          name: input.name,
          counterparty: input.counterparty ?? null,
          status: input.status ?? 'active',
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          note: input.note ?? null,
        })
        .returning();
      if (!row) throw new Error('Контракт не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'contract.created',
      entityType: 'contract',
      entityId: created.id,
      after: { name: created.name },
    });
    return { id: created.id, name: created.name, status: created.status };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(contract)
        .where(isNull(contract.deletedAt))
        .orderBy(desc(contract.createdAt)),
    );
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      counterparty: c.counterparty,
      status: c.status,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      note: c.note,
    }));
  }

  async remove(actor: Actor, id: string) {
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: contract.id })
        .from(contract)
        .where(and(eq(contract.id, id), isNull(contract.deletedAt)));
      if (!row) throw new NotFoundException(`Контракт ${id} не найден`);
      await tx.update(contract).set({ deletedAt: new Date() }).where(eq(contract.id, id));
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'contract.deleted',
      entityType: 'contract',
      entityId: id,
    });
    return { deleted: true };
  }
}
