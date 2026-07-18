import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { asset, auditableEntity } from '../db/schema';
import { UniverseService } from '../universe/universe.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

interface CreateInput {
  type: string;
  name: string;
  subsidiaryId?: string;
  ownerMembershipId?: string;
  attrs?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly universeService: UniverseService,
  ) {}

  async create(actor: Actor, input: CreateInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(asset)
        .values({
          tenantId: actor.tenantId,
          subsidiaryId: input.subsidiaryId ?? null,
          type: input.type,
          name: input.name,
          ownerMembershipId: input.ownerMembershipId ?? null,
          attrs: input.attrs ?? {},
          custom: input.custom ?? {},
        })
        .returning();
      if (!row) throw new Error('Актив не создался');
      return row;
    });
    // проекция в audit universe (kind=system, ref_id=asset.id)
    const node = await this.universeService.create(actor, {
      kind: 'system',
      nameI18n: { en: created.name },
      ownerMembershipId: created.ownerMembershipId ?? undefined,
      refId: created.id,
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'asset.created',
      entityType: 'asset',
      entityId: created.id,
      after: { name: created.name, type: created.type, entityId: node.id },
    });
    return { id: created.id, entityId: node.id };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          ownerMembershipId: asset.ownerMembershipId,
          fromConnector: asset.connectorId,
          entityId: auditableEntity.id,
        })
        .from(asset)
        .leftJoin(
          auditableEntity,
          and(eq(auditableEntity.refId, asset.id), isNull(auditableEntity.deletedAt)),
        )
        .where(isNull(asset.deletedAt))
        .orderBy(desc(asset.createdAt)),
    );
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      ownerMembershipId: a.ownerMembershipId,
      fromConnector: a.fromConnector !== null,
      entityId: a.entityId,
    }));
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(asset)
        .where(and(eq(asset.id, id), isNull(asset.deletedAt)));
      if (!row) throw new NotFoundException(`Актив ${id} не найден`);
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        subsidiaryId: row.subsidiaryId,
        ownerMembershipId: row.ownerMembershipId,
        connectorId: row.connectorId,
        attrs: row.attrs,
        custom: row.custom,
      };
    });
  }
}
