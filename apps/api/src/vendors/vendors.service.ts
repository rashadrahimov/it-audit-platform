import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { vendor } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Lifecycle вендора (T-060, B5): procurement→active→archived. */
const FLOW: Record<string, string[]> = {
  procurement: ['active', 'archived'],
  active: ['archived'],
};

export interface CreateVendorInput {
  name: string;
  category?: string;
  url?: string;
  inherentRisk?: string;
  residualRisk?: string;
  securityOwnerMembershipId?: string;
  intake?: Record<string, unknown>;
}

/** Vendor register (T-060, B5): CRUD + жизненный цикл. */
@Injectable()
export class VendorsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: CreateVendorInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(vendor)
        .values({
          tenantId: actor.tenantId,
          name: input.name,
          category: input.category ?? null,
          url: input.url ?? null,
          inherentRisk: input.inherentRisk ?? null,
          residualRisk: input.residualRisk ?? null,
          securityOwnerMembershipId: input.securityOwnerMembershipId ?? null,
          intake: input.intake ?? {},
        })
        .returning();
      if (!row) throw new Error('Вендор не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vendor.created',
      entityType: 'vendor',
      entityId: created.id,
      after: { name: created.name },
    });
    return { id: created.id, status: created.status };
  }

  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(vendor)
        .where(and(eq(vendor.id, id), isNull(vendor.deletedAt)));
      if (!row) throw new NotFoundException(`Вендор ${id} не найден`);
      if (!FLOW[row.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      await tx.update(vendor).set({ status: to }).where(eq(vendor.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vendor.status_changed',
      entityType: 'vendor',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  async list(
    tenantId: string,
    filters?: { status?: string; category?: string; inherentRisk?: string },
  ) {
    const conds = [isNull(vendor.deletedAt)];
    if (filters?.status) conds.push(eq(vendor.status, filters.status));
    if (filters?.category) conds.push(eq(vendor.category, filters.category));
    if (filters?.inherentRisk) conds.push(eq(vendor.inherentRisk, filters.inherentRisk));
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(vendor)
        .where(and(...conds))
        .orderBy(desc(vendor.createdAt)),
    );
    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      inherentRisk: v.inherentRisk,
      residualRisk: v.residualRisk,
      status: v.status,
    }));
  }

  async detail(tenantId: string, id: string) {
    const [v] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(vendor)
        .where(and(eq(vendor.id, id), isNull(vendor.deletedAt))),
    );
    if (!v) throw new NotFoundException(`Вендор ${id} не найден`);
    return {
      id: v.id,
      name: v.name,
      category: v.category,
      url: v.url,
      inherentRisk: v.inherentRisk,
      residualRisk: v.residualRisk,
      status: v.status,
      intake: v.intake,
    };
  }
}
