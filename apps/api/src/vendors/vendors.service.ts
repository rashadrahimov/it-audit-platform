import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { membership, user, vendor } from '../db/schema';

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

  /** T-V13: частичное редактирование (атрибуты/риски/security owner/intake). */
  async update(
    actor: Actor,
    id: string,
    input: {
      name?: string;
      category?: string | null;
      url?: string | null;
      inherentRisk?: string | null;
      residualRisk?: string | null;
      securityOwnerMembershipId?: string | null;
      intake?: Record<string, unknown>;
    },
  ) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: vendor.id })
        .from(vendor)
        .where(and(eq(vendor.id, id), isNull(vendor.deletedAt)));
      if (!row) throw new NotFoundException(`Вендор ${id} не найден`);
      if (input.securityOwnerMembershipId) {
        // membership над-тенантная (без RLS) — принадлежность тенанту проверяем явно
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.id, input.securityOwnerMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!m) throw new BadRequestException('securityOwnerMembershipId: участник не найден');
      }
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.category !== undefined) patch.category = input.category;
      if (input.url !== undefined) patch.url = input.url;
      if (input.inherentRisk !== undefined) patch.inherentRisk = input.inherentRisk;
      if (input.residualRisk !== undefined) patch.residualRisk = input.residualRisk;
      if (input.securityOwnerMembershipId !== undefined)
        patch.securityOwnerMembershipId = input.securityOwnerMembershipId;
      if (input.intake !== undefined) patch.intake = input.intake;
      const [res] = await tx.update(vendor).set(patch).where(eq(vendor.id, id)).returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vendor.updated',
      entityType: 'vendor',
      entityId: id,
      after: {
        name: updated.name,
        residualRisk: updated.residualRisk,
        securityOwnerMembershipId: updated.securityOwnerMembershipId,
      },
    });
    return { id: updated.id, status: updated.status };
  }

  /** T-V13: счётчики по категориям/inherent-рискам/статусам для блока аналитики. */
  async analytics(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          category: vendor.category,
          inherentRisk: vendor.inherentRisk,
          status: vendor.status,
        })
        .from(vendor)
        .where(isNull(vendor.deletedAt)),
    );
    const count = (key: 'category' | 'inherentRisk' | 'status') => {
      const acc: Record<string, number> = {};
      for (const r of rows) {
        const k = r[key] ?? 'uncategorized';
        acc[k] = (acc[k] ?? 0) + 1;
      }
      return acc;
    };
    return {
      total: rows.length,
      byCategory: count('category'),
      byInherentRisk: count('inherentRisk'),
      byStatus: count('status'),
    };
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
        .select({ vendor: vendor, securityOwner: user.fullName })
        .from(vendor)
        .leftJoin(membership, eq(vendor.securityOwnerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(...conds))
        .orderBy(desc(vendor.createdAt)),
    );
    return rows.map(({ vendor: v, securityOwner }) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      inherentRisk: v.inherentRisk,
      residualRisk: v.residualRisk,
      status: v.status,
      securityOwner,
    }));
  }

  async detail(tenantId: string, id: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ vendor: vendor, securityOwner: user.fullName })
        .from(vendor)
        .leftJoin(membership, eq(vendor.securityOwnerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(eq(vendor.id, id), isNull(vendor.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Вендор ${id} не найден`);
    const v = row.vendor;
    return {
      id: v.id,
      name: v.name,
      category: v.category,
      url: v.url,
      inherentRisk: v.inherentRisk,
      residualRisk: v.residualRisk,
      status: v.status,
      intake: v.intake,
      securityOwnerMembershipId: v.securityOwnerMembershipId,
      securityOwner: row.securityOwner,
    };
  }
}
