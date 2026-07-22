import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { tag, tagLink } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Сущности, на которые можно вешать теги (белый список, T-076). */
const TAGGABLE_ENTITY_TYPES = new Set([
  'finding',
  'control',
  'risk',
  'vendor',
  'asset',
  'engagement',
  'policy',
  'processing_activity',
  'auditable_entity',
]);

@Injectable()
export class TagsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: { name: string; color?: string }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(tag)
        .values({ tenantId: actor.tenantId, name: input.name, color: input.color ?? null })
        .onConflictDoNothing({ target: [tag.tenantId, tag.name] })
        .returning();
      if (!row) throw new BadRequestException(`Тег «${input.name}» уже существует`);
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'tag.created',
      entityType: 'tag',
      entityId: created.id,
      after: { name: created.name },
    });
    return { id: created.id, name: created.name };
  }

  async update(actor: Actor, tagId: string, input: { name?: string; color?: string | null }) {
    const name = input.name?.trim();
    if (name) {
      const [duplicate] = await this.dbService.withTenant(actor.tenantId, (tx) =>
        tx
          .select({ id: tag.id })
          .from(tag)
          .where(and(eq(tag.tenantId, actor.tenantId), eq(tag.name, name), ne(tag.id, tagId))),
      );
      if (duplicate) throw new BadRequestException(`Тег «${name}» уже существует`);
    }

    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [current] = await tx
        .select({ id: tag.id, name: tag.name, color: tag.color })
        .from(tag)
        .where(and(eq(tag.id, tagId), isNull(tag.deletedAt)));
      if (!current) throw new NotFoundException(`Тег ${tagId} не найден`);
      const [row] = await tx
        .update(tag)
        .set({
          name: name || current.name,
          color: input.color === undefined ? current.color : input.color || null,
        })
        .where(eq(tag.id, tagId))
        .returning({ id: tag.id, name: tag.name, color: tag.color });
      return row!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'tag.updated',
      entityType: 'tag',
      entityId: updated.id,
      after: { name: updated.name, color: updated.color },
    });
    return updated;
  }

  async delete(actor: Actor, tagId: string) {
    const deleted = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .update(tag)
        .set({ deletedAt: new Date() })
        .where(and(eq(tag.id, tagId), isNull(tag.deletedAt)))
        .returning({ id: tag.id, name: tag.name });
      if (!row) throw new NotFoundException(`Тег ${tagId} не найден`);
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'tag.deleted',
      entityType: 'tag',
      entityId: deleted.id,
      before: { name: deleted.name },
    });
    return { deleted: true };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: tag.id, name: tag.name, color: tag.color })
        .from(tag)
        .where(isNull(tag.deletedAt))
        .orderBy(desc(tag.createdAt)),
    );
    return rows;
  }

  async attach(actor: Actor, tagId: string, entityType: string, entityId: string) {
    if (!TAGGABLE_ENTITY_TYPES.has(entityType)) {
      throw new BadRequestException(
        `entityType: ожидается ${[...TAGGABLE_ENTITY_TYPES].join('|')}`,
      );
    }
    const linked = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [t] = await tx
        .select({ id: tag.id })
        .from(tag)
        .where(and(eq(tag.id, tagId), isNull(tag.deletedAt)));
      if (!t) throw new NotFoundException(`Тег ${tagId} не найден`);
      const [row] = await tx
        .insert(tagLink)
        .values({ tagId, entityType, entityId })
        .onConflictDoNothing()
        .returning();
      return Boolean(row);
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'tag.attached',
      entityType,
      entityId,
      after: { tagId },
    });
    return { linked };
  }

  async detach(actor: Actor, tagId: string, entityType: string, entityId: string) {
    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .delete(tagLink)
        .where(
          and(
            eq(tagLink.tagId, tagId),
            eq(tagLink.entityType, entityType),
            eq(tagLink.entityId, entityId),
          ),
        ),
    );
    return { detached: true };
  }

  /** Теги, навешенные на сущность. */
  async tagsOf(tenantId: string, entityType: string, entityId: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: tag.id, name: tag.name, color: tag.color })
        .from(tagLink)
        .innerJoin(tag, eq(tagLink.tagId, tag.id))
        .where(
          and(
            eq(tagLink.entityType, entityType),
            eq(tagLink.entityId, entityId),
            isNull(tag.deletedAt),
          ),
        ),
    );
  }
}
