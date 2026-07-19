import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { document, documentLink, membership, user } from '../db/schema';
import { FileStorageService, type StoredObject } from '../files/file-storage.service';

/** Известные цели привязки; целостность полиморфизма — на уровне сервиса (data-model §10.5). */
const LINKABLE_ENTITY_TYPES = new Set([
  'response',
  'checklist_item',
  'engagement',
  'control',
  'framework',
  'subsidiary',
  'risk_assessment',
  'policy',
  'vendor_assessment',
  'auditable_entity',
  'privacy_assessment',
]);
const RELATIONS = new Set(['evidence', 'permanent_file', 'attachment', 'report']);

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface LinkInput {
  entityType: string;
  entityId: string;
  relation: string;
}

/** Документы-доказательства (T-034): метаданные + S3 (T-042), полиморфные привязки. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly storage: FileStorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async upload(
    actor: Actor,
    file: { buffer: Buffer; originalName: string; mime: string },
    options: { renewBy?: string; link?: LinkInput },
  ) {
    const [owner] = await this.dbService.db
      .select()
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
    if (!owner) throw new BadRequestException('У юзера нет membership в тенанте');
    if (options.link) this.validateLink(options.link);

    const storageKey = `documents/${randomUUID()}/${file.originalName}`;
    await this.storage.put(storageKey, file.buffer, file.mime, {
      originalname: encodeURIComponent(file.originalName),
    });

    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(document)
        .values({
          tenantId: actor.tenantId,
          storageKey,
          filename: file.originalName,
          mime: file.mime,
          size: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          ownerMembershipId: owner.id,
          renewBy: options.renewBy ? new Date(options.renewBy) : null,
        })
        .returning();
      if (!row) throw new Error('Документ не создался');
      if (options.link) {
        await tx.insert(documentLink).values({ documentId: row.id, ...options.link });
      }
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: created.id,
      after: { filename: created.filename, sha256: created.sha256, link: options.link ?? null },
    });
    return created;
  }

  async addLink(actor: Actor, documentId: string, link: LinkInput) {
    this.validateLink(link);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(document)
        .where(and(eq(document.id, documentId), isNull(document.deletedAt)));
      if (!doc) throw new NotFoundException(`Документ ${documentId} не найден`);
      const [row] = await tx
        .insert(documentLink)
        .values({ documentId, ...link })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'document.linked',
      entityType: 'document',
      entityId: documentId,
      after: link,
    });
    return { linked: created !== null };
  }

  /** T-V01: tenant-wide реестр документов — owner-имя, счётчик привязок, фильтры. */
  async listAll(tenantId: string, filters?: { status?: string; ownerMembershipId?: string }) {
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const conds = [isNull(document.deletedAt)];
      if (filters?.status) conds.push(eq(document.status, filters.status));
      if (filters?.ownerMembershipId) {
        conds.push(eq(document.ownerMembershipId, filters.ownerMembershipId));
      }
      const docs = await tx
        .select({
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          size: document.size,
          version: document.version,
          renewBy: document.renewBy,
          status: document.status,
          createdAt: document.createdAt,
          owner: user.fullName,
        })
        .from(document)
        .leftJoin(membership, eq(document.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(...conds))
        .orderBy(desc(document.createdAt));
      const links = await tx
        .select({ documentId: documentLink.documentId, count: sql<number>`count(*)::int` })
        .from(documentLink)
        .groupBy(documentLink.documentId);
      return { docs, links };
    });
    const linkCount = new Map(data.links.map((l) => [l.documentId, l.count]));
    return data.docs.map((d) => ({
      ...d,
      renewBy: d.renewBy?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      links: linkCount.get(d.id) ?? 0,
    }));
  }

  /** T-V01: переназначить owner документа (админ-действие). */
  async reassignOwner(actor: Actor, documentId: string, ownerMembershipId: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(document)
        .where(and(eq(document.id, documentId), isNull(document.deletedAt)));
      if (!doc) throw new NotFoundException(`Документ ${documentId} не найден`);
      const [m] = await tx
        .select()
        .from(membership)
        .where(and(eq(membership.id, ownerMembershipId), eq(membership.tenantId, actor.tenantId)));
      if (!m) throw new BadRequestException('ownerMembershipId: membership не найден в тенанте');
      await tx.update(document).set({ ownerMembershipId }).where(eq(document.id, documentId));
      return { before: doc.ownerMembershipId, after: ownerMembershipId };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'document.owner_changed',
      entityType: 'document',
      entityId: documentId,
      before: { ownerMembershipId: result.before },
      after: { ownerMembershipId: result.after },
    });
    return result;
  }

  /** Документы сущности (через привязки), новые сверху. */
  async listFor(tenantId: string, entityType: string, entityId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          size: document.size,
          sha256: document.sha256,
          version: document.version,
          relation: documentLink.relation,
          renewBy: document.renewBy,
          status: document.status,
          createdAt: document.createdAt,
        })
        .from(documentLink)
        .innerJoin(document, eq(documentLink.documentId, document.id))
        .where(
          and(
            eq(documentLink.entityType, entityType),
            eq(documentLink.entityId, entityId),
            isNull(document.deletedAt),
          ),
        )
        .orderBy(desc(document.createdAt)),
    );
    return rows.map((r) => ({
      ...r,
      renewBy: r.renewBy?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Авторизованное скачивание: метаданные под RLS, тело — из S3. */
  async content(
    tenantId: string,
    documentId: string,
  ): Promise<{ filename: string; stored: StoredObject }> {
    const [doc] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(document)
        .where(and(eq(document.id, documentId), isNull(document.deletedAt))),
    );
    if (!doc) throw new NotFoundException(`Документ ${documentId} не найден`);
    const stored = await this.storage.get(doc.storageKey);
    if (!stored) throw new NotFoundException('Файл отсутствует в хранилище');
    return { filename: doc.filename, stored };
  }

  private validateLink(link: LinkInput): void {
    if (!LINKABLE_ENTITY_TYPES.has(link.entityType)) {
      throw new BadRequestException(
        `entityType: ожидается ${[...LINKABLE_ENTITY_TYPES].join('|')}`,
      );
    }
    if (!RELATIONS.has(link.relation)) {
      throw new BadRequestException(`relation: ожидается ${[...RELATIONS].join('|')}`);
    }
  }
}
