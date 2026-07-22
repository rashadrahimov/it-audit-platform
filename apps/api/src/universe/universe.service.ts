import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { I18nText } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditableEntity, document, documentLink } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Виды узлов universe (UNI-01). subsidiary/process/system — проекции спец-сущностей. */
export const ENTITY_KINDS = [
  'subsidiary',
  'process',
  'system',
  'location',
  'activity',
  'function',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

interface CreateInput {
  kind: EntityKind;
  nameI18n: I18nText;
  parentId?: string;
  descriptionI18n?: I18nText;
  ownerMembershipId?: string;
  refId?: string;
  custom?: Record<string, unknown>;
}
type UpdateInput = Partial<Pick<CreateInput, 'kind' | 'nameI18n'>> & {
  descriptionI18n?: I18nText | null;
};

@Injectable()
export class UniverseService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: CreateInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      if (input.parentId) {
        const [parent] = await tx
          .select({ id: auditableEntity.id })
          .from(auditableEntity)
          .where(and(eq(auditableEntity.id, input.parentId), isNull(auditableEntity.deletedAt)));
        if (!parent) throw new BadRequestException(`Родитель ${input.parentId} не найден`);
      }
      const [row] = await tx
        .insert(auditableEntity)
        .values({
          tenantId: actor.tenantId,
          parentId: input.parentId ?? null,
          kind: input.kind,
          refId: input.refId ?? null,
          nameI18n: input.nameI18n,
          descriptionI18n: input.descriptionI18n ?? null,
          ownerMembershipId: input.ownerMembershipId ?? null,
          custom: input.custom ?? {},
        })
        .returning();
      if (!row) throw new Error('Узел не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'auditable_entity.created',
      entityType: 'auditable_entity',
      entityId: created.id,
      after: { kind: created.kind, parentId: created.parentId },
    });
    return { id: created.id, kind: created.kind, parentId: created.parentId };
  }

  /** Смена родителя. Защита от цикла: новый родитель не должен быть потомком узла. */
  async move(actor: Actor, id: string, newParentId: string | null) {
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const nodes = await tx
        .select({ id: auditableEntity.id, parentId: auditableEntity.parentId })
        .from(auditableEntity)
        .where(isNull(auditableEntity.deletedAt));
      const byId = new Map(nodes.map((n) => [n.id, n.parentId]));
      if (!byId.has(id)) throw new NotFoundException(`Узел ${id} не найден`);
      if (newParentId) {
        if (newParentId === id) throw new BadRequestException('Узел не может быть своим родителем');
        if (!byId.has(newParentId))
          throw new BadRequestException(`Родитель ${newParentId} не найден`);
        // подъём от нового родителя к корню — если встретим id, значит это потомок → цикл
        let cur: string | null | undefined = newParentId;
        while (cur) {
          if (cur === id) throw new BadRequestException('Перемещение создаёт цикл в дереве');
          cur = byId.get(cur);
        }
      }
      await tx
        .update(auditableEntity)
        .set({ parentId: newParentId })
        .where(eq(auditableEntity.id, id));
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'auditable_entity.moved',
      entityType: 'auditable_entity',
      entityId: id,
      after: { parentId: newParentId },
    });
    return { id, parentId: newParentId };
  }

  async update(actor: Actor, id: string, input: UpdateInput) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(auditableEntity)
        .where(and(eq(auditableEntity.id, id), isNull(auditableEntity.deletedAt)));
      if (!existing) throw new NotFoundException(`Узел ${id} не найден`);
      const [row] = await tx
        .update(auditableEntity)
        .set({
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.nameI18n !== undefined ? { nameI18n: input.nameI18n } : {}),
          ...(input.descriptionI18n !== undefined
            ? { descriptionI18n: input.descriptionI18n }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(auditableEntity.id, id))
        .returning();
      if (!row) throw new NotFoundException(`Узел ${id} не найден`);
      return { existing, row };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'auditable_entity.updated',
      entityType: 'auditable_entity',
      entityId: id,
      before: { kind: updated.existing.kind, nameI18n: updated.existing.nameI18n },
      after: { kind: updated.row.kind, nameI18n: updated.row.nameI18n },
    });
    return { id: updated.row.id, kind: updated.row.kind, nameI18n: updated.row.nameI18n };
  }

  async remove(actor: Actor, id: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: auditableEntity.id, kind: auditableEntity.kind })
        .from(auditableEntity)
        .where(and(eq(auditableEntity.id, id), isNull(auditableEntity.deletedAt)));
      if (!existing) throw new NotFoundException(`Узел ${id} не найден`);
      const [child] = await tx
        .select({ id: auditableEntity.id })
        .from(auditableEntity)
        .where(and(eq(auditableEntity.parentId, id), isNull(auditableEntity.deletedAt)))
        .limit(1);
      if (child) throw new BadRequestException('Сначала переместите или удалите дочерние узлы');
      await tx
        .update(auditableEntity)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(auditableEntity.id, id));
      return existing;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'auditable_entity.deleted',
      entityType: 'auditable_entity',
      entityId: id,
      before: removed,
    });
  }

  /** Плоский список всех узлов тенанта (клиент строит дерево по parentId). */
  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(auditableEntity).where(isNull(auditableEntity.deletedAt)),
    );
    return rows.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      kind: n.kind,
      nameI18n: n.nameI18n,
      ownerMembershipId: n.ownerMembershipId,
      refId: n.refId,
    }));
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [node] = await tx
        .select()
        .from(auditableEntity)
        .where(and(eq(auditableEntity.id, id), isNull(auditableEntity.deletedAt)));
      if (!node) throw new NotFoundException(`Узел ${id} не найден`);
      const children = await tx
        .select({
          id: auditableEntity.id,
          kind: auditableEntity.kind,
          nameI18n: auditableEntity.nameI18n,
        })
        .from(auditableEntity)
        .where(and(eq(auditableEntity.parentId, id), isNull(auditableEntity.deletedAt)));
      const docs = await tx
        .select({ id: document.id, filename: document.filename, relation: documentLink.relation })
        .from(documentLink)
        .innerJoin(document, eq(documentLink.documentId, document.id))
        .where(
          and(
            eq(documentLink.entityType, 'auditable_entity'),
            eq(documentLink.entityId, id),
            isNull(document.deletedAt),
          ),
        );
      return {
        id: node.id,
        kind: node.kind,
        parentId: node.parentId,
        nameI18n: node.nameI18n,
        descriptionI18n: node.descriptionI18n,
        ownerMembershipId: node.ownerMembershipId,
        refId: node.refId,
        custom: node.custom,
        children,
        documents: docs,
      };
    });
  }
}
