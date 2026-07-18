import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { document, documentLink, membership } from '../db/schema';
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
