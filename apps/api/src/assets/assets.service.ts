import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { ConnectorSyncService } from '../connectors/connector-sync.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DbService } from '../db/db.service';
import { asset, auditableEntity, connector, membership, tag, tagLink, user } from '../db/schema';
import { UniverseService } from '../universe/universe.service';

const strField = (r: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  }
  return null;
};

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
    private readonly connectorSyncService: ConnectorSyncService,
    private readonly customFieldsService?: CustomFieldsService,
  ) {}

  /**
   * Авто-обнаружение активов из коннектора (T-068, B3): требует capability `inventory`.
   * Upsert по (connector_id, external_id) — повторный импорт без дублей; новые проецируются в universe.
   */
  async importFromConnector(actor: Actor, connectorId: string, defaultType = 'other') {
    const [conn] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, connectorId), isNull(connector.deletedAt))),
    );
    if (!conn) throw new NotFoundException(`Коннектор ${connectorId} не найден`);
    if (!conn.capabilities.includes('inventory')) {
      throw new BadRequestException(
        'Коннектор не имеет capability «inventory» (авто-обнаружение активов)',
      );
    }

    const { records } = await this.connectorSyncService.collectRecords(actor.tenantId, connectorId);
    let imported = 0;
    let updated = 0;
    for (const r of records) {
      const externalId = strField(r, ['id', 'dn', 'uid', 'externalId']);
      if (!externalId) continue;
      const name = strField(r, ['name', 'cn', 'hostname', 'fullName', 'uid']) ?? externalId;
      const type = strField(r, ['type']) ?? defaultType;
      const existing = await this.dbService.withTenant(actor.tenantId, (tx) =>
        tx
          .select({ id: asset.id })
          .from(asset)
          .where(
            and(
              eq(asset.connectorId, connectorId),
              eq(asset.externalId, externalId),
              isNull(asset.deletedAt),
            ),
          ),
      );
      if (existing.length > 0) {
        await this.dbService.withTenant(actor.tenantId, (tx) =>
          tx.update(asset).set({ name }).where(eq(asset.id, existing[0]!.id)),
        );
        updated += 1;
        continue;
      }
      const [row] = await this.dbService.withTenant(actor.tenantId, (tx) =>
        tx
          .insert(asset)
          .values({ tenantId: actor.tenantId, connectorId, externalId, type, name, attrs: r })
          .returning(),
      );
      if (!row) continue;
      await this.universeService.create(actor, {
        kind: 'system',
        nameI18n: { en: row.name },
        refId: row.id,
      });
      imported += 1;
    }
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'asset.imported',
      entityType: 'connector',
      entityId: connectorId,
      after: { imported, updated },
    });
    return { imported, updated };
  }

  async create(actor: Actor, input: CreateInput) {
    const custom = this.customFieldsService
      ? await this.customFieldsService.validateForWrite(actor.tenantId, 'asset', input.custom)
      : (input.custom ?? {});
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
          custom,
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

  async list(tenantId: string, filters?: { type?: string }) {
    const conds = [isNull(asset.deletedAt)];
    if (filters?.type) conds.push(eq(asset.type, filters.type));
    const { rows, tagRows } = await this.dbService.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          ownerMembershipId: asset.ownerMembershipId,
          owner: user.fullName,
          fromConnector: asset.connectorId,
          provider: connector.provider,
          entityId: auditableEntity.id,
        })
        .from(asset)
        .leftJoin(
          auditableEntity,
          and(eq(auditableEntity.refId, asset.id), isNull(auditableEntity.deletedAt)),
        )
        .leftJoin(membership, eq(asset.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .leftJoin(connector, eq(asset.connectorId, connector.id))
        .where(and(...conds))
        .orderBy(desc(asset.createdAt));
      // теги всех активов одним запросом (полиморфный tag_link, T-076)
      const ids = rows.map((r) => r.id);
      const tagRows = ids.length
        ? await tx
            .select({ entityId: tagLink.entityId, name: tag.name, color: tag.color })
            .from(tagLink)
            .innerJoin(tag, eq(tagLink.tagId, tag.id))
            .where(
              and(
                eq(tagLink.entityType, 'asset'),
                inArray(tagLink.entityId, ids),
                isNull(tag.deletedAt),
              ),
            )
        : [];
      return { rows, tagRows };
    });
    const tagsByAsset = new Map<string, Array<{ name: string; color: string | null }>>();
    for (const t of tagRows) {
      const list = tagsByAsset.get(t.entityId) ?? [];
      list.push({ name: t.name, color: t.color });
      tagsByAsset.set(t.entityId, list);
    }
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      ownerMembershipId: a.ownerMembershipId,
      owner: a.owner,
      fromConnector: a.fromConnector !== null,
      provider: a.provider,
      entityId: a.entityId,
      tags: tagsByAsset.get(a.id) ?? [],
    }));
  }

  /** T-V11: bulk-тег — find-or-create тега по имени + привязка к каждому активу. */
  async bulkTag(actor: Actor, assetIds: string[], tagName: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const assets = await tx
        .select({ id: asset.id })
        .from(asset)
        .where(and(inArray(asset.id, assetIds), isNull(asset.deletedAt)));
      if (assets.length !== assetIds.length) {
        throw new BadRequestException('Часть активов не найдена');
      }
      let [t] = await tx
        .select()
        .from(tag)
        .where(and(eq(tag.tenantId, actor.tenantId), eq(tag.name, tagName), isNull(tag.deletedAt)));
      if (!t) {
        [t] = await tx.insert(tag).values({ tenantId: actor.tenantId, name: tagName }).returning();
      }
      let tagged = 0;
      for (const a of assets) {
        const [row] = await tx
          .insert(tagLink)
          .values({ tagId: t!.id, entityType: 'asset', entityId: a.id })
          .onConflictDoNothing()
          .returning();
        if (row) tagged += 1;
      }
      return { tagId: t!.id, tagged };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'asset.bulk_tagged',
      entityType: 'tag',
      entityId: result.tagId,
      after: { tag: tagName, assets: assetIds.length, tagged: result.tagged },
    });
    return result;
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
