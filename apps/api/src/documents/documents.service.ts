import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { EvidenceReviewStatus } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  checklistItem,
  document,
  documentLink,
  engagement,
  membership,
  response,
  user,
} from '../db/schema';
import { resolveActorCategory, resolveAuditorScope } from '../rbac/auditor-scope';
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
    options: {
      renewBy?: string;
      category?: string;
      status?: 'draft' | 'active';
      link?: LinkInput;
      /** T-V02: закрыть needs_document-плейсхолдер или загрузить новую версию. */
      supersedesId?: string;
    },
  ) {
    const [owner] = await this.dbService.db
      .select()
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
    if (!owner) throw new BadRequestException('У юзера нет membership в тенанте');
    if (options.link) this.validateLink(options.link);
    const status = options.status ?? 'active';
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    const storageKey = `documents/${randomUUID()}/${file.originalName}`;
    await this.storage.put(storageKey, file.buffer, file.mime, {
      originalname: encodeURIComponent(file.originalName),
    });

    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      // T-V02: закрытие needs_document-плейсхолдера или новая версия существующего
      if (options.supersedesId) {
        const [target] = await tx
          .select()
          .from(document)
          .where(and(eq(document.id, options.supersedesId), isNull(document.deletedAt)));
        if (!target) throw new BadRequestException('supersedesId: документ не найден');

        // плейсхолдер (файла ещё не было) — заполняем ту же запись
        if (target.status === 'needs_document') {
          const [row] = await tx
            .update(document)
            .set({
              storageKey,
              filename: file.originalName,
              mime: file.mime,
              size: file.buffer.length,
              sha256,
              status,
              renewBy: options.renewBy ? new Date(options.renewBy) : target.renewBy,
              category: options.category ?? target.category,
            })
            .where(eq(document.id, target.id))
            .returning();
          return { row: row!, action: 'document.fulfilled' as const };
        }

        // уже был файл — создаём НОВУЮ версию, переносим привязки, старую прячем
        const [row] = await tx
          .insert(document)
          .values({
            tenantId: actor.tenantId,
            storageKey,
            filename: file.originalName,
            mime: file.mime,
            size: file.buffer.length,
            sha256,
            version: target.version + 1,
            prevVersionId: target.id,
            ownerMembershipId: target.ownerMembershipId,
            renewBy: options.renewBy ? new Date(options.renewBy) : target.renewBy,
            category: options.category ?? target.category,
            status,
          })
          .returning();
        const links = await tx
          .select()
          .from(documentLink)
          .where(eq(documentLink.documentId, target.id));
        for (const l of links) {
          await tx
            .insert(documentLink)
            .values({
              documentId: row!.id,
              entityType: l.entityType,
              entityId: l.entityId,
              relation: l.relation,
            })
            .onConflictDoNothing();
        }
        await tx
          .update(document)
          .set({ deletedAt: sql`now()` })
          .where(eq(document.id, target.id));
        return { row: row!, action: 'document.new_version' as const };
      }

      // обычная загрузка
      const [row] = await tx
        .insert(document)
        .values({
          tenantId: actor.tenantId,
          storageKey,
          filename: file.originalName,
          mime: file.mime,
          size: file.buffer.length,
          sha256,
          ownerMembershipId: owner.id,
          renewBy: options.renewBy ? new Date(options.renewBy) : null,
          category: options.category ?? null,
          status,
        })
        .returning();
      if (!row) throw new Error('Документ не создался');
      if (options.link) {
        await tx.insert(documentLink).values({ documentId: row.id, ...options.link });
      }
      return { row, action: 'document.uploaded' as const };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: result.action,
      entityType: 'document',
      entityId: result.row.id,
      after: { filename: result.row.filename, sha256, version: result.row.version },
    });
    return result.row;
  }

  /** T-V02: запросить доказательство (needs_document-плейсхолдер без файла). */
  async requestDocument(
    actor: Actor,
    input: { filename: string; category?: string; renewBy?: string; link?: LinkInput },
  ) {
    const [owner] = await this.dbService.db
      .select()
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
    if (!owner) throw new BadRequestException('У юзера нет membership в тенанте');
    if (input.link) this.validateLink(input.link);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(document)
        .values({
          tenantId: actor.tenantId,
          storageKey: '',
          filename: input.filename,
          mime: '',
          size: 0,
          sha256: '',
          ownerMembershipId: owner.id,
          renewBy: input.renewBy ? new Date(input.renewBy) : null,
          category: input.category ?? null,
          status: 'needs_document',
        })
        .returning();
      if (!row) throw new Error('Плейсхолдер не создался');
      if (input.link) {
        await tx.insert(documentLink).values({ documentId: row.id, ...input.link });
      }
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'document.requested',
      entityType: 'document',
      entityId: created.id,
      after: { filename: created.filename, category: created.category },
    });
    return created;
  }

  /** T-V02: опубликовать черновик (draft → active). */
  async publish(actor: Actor, documentId: string) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(document)
        .where(and(eq(document.id, documentId), isNull(document.deletedAt)));
      if (!doc) throw new NotFoundException(`Документ ${documentId} не найден`);
      if (doc.status !== 'draft') {
        throw new BadRequestException('Публиковать можно только черновик (draft)');
      }
      const [row] = await tx
        .update(document)
        .set({ status: 'active' })
        .where(eq(document.id, documentId))
        .returning();
      return row!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'document.published',
      entityType: 'document',
      entityId: documentId,
      after: { status: 'active' },
    });
    return { id: updated.id, status: updated.status };
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
          category: document.category,
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

  /**
   * T-111: дочка сущности, к которой привязан документ, — для scoped Auditor View.
   * Прослеживает evidence-путь response→checklist_item→engagement→subsidiary.
   * Возвращает null для глобальных/библиотечных целей (control/framework/…) —
   * их скоуп не режет; для несуществующей сущности — тоже null.
   */
  private async entitySubsidiary(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<{ subsidiaryId: string | null; subsidiaryBound: boolean }> {
    if (entityType === 'subsidiary') return { subsidiaryId: entityId, subsidiaryBound: true };
    if (entityType === 'engagement') {
      const [e] = await this.dbService.withTenant(tenantId, (tx) =>
        tx
          .select({ s: engagement.subsidiaryId })
          .from(engagement)
          .where(eq(engagement.id, entityId)),
      );
      return { subsidiaryId: e?.s ?? null, subsidiaryBound: true };
    }
    if (entityType === 'checklist_item') {
      const [ci] = await this.dbService.withTenant(tenantId, (tx) =>
        tx
          .select({ s: engagement.subsidiaryId })
          .from(checklistItem)
          .innerJoin(engagement, eq(checklistItem.engagementId, engagement.id))
          .where(eq(checklistItem.id, entityId)),
      );
      return { subsidiaryId: ci?.s ?? null, subsidiaryBound: true };
    }
    if (entityType === 'response') {
      const [r] = await this.dbService.withTenant(tenantId, (tx) =>
        tx
          .select({ s: engagement.subsidiaryId })
          .from(response)
          .innerJoin(checklistItem, eq(response.checklistItemId, checklistItem.id))
          .innerJoin(engagement, eq(checklistItem.engagementId, engagement.id))
          .where(eq(response.id, entityId)),
      );
      return { subsidiaryId: r?.s ?? null, subsidiaryBound: true };
    }
    // control/framework/policy/… — не привязаны к дочке: библиотека/глобальные.
    return { subsidiaryId: null, subsidiaryBound: false };
  }

  async listFor(tenantId: string, userId: string, entityType: string, entityId: string) {
    // T-111: внешний аудитор со scope не видит документы сущностей вне своих дочек.
    const scope = await resolveAuditorScope(this.dbService, tenantId, userId);
    if (scope !== null) {
      const { subsidiaryId, subsidiaryBound } = await this.entitySubsidiary(
        tenantId,
        entityType,
        entityId,
      );
      if (subsidiaryBound && (subsidiaryId === null || !scope.includes(subsidiaryId))) {
        return [];
      }
    }
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
          linkId: documentLink.id,
          reviewStatus: documentLink.reviewStatus,
          renewBy: document.renewBy,
          status: document.status,
          category: document.category,
          createdAt: document.createdAt,
          owner: user.fullName,
        })
        .from(documentLink)
        .innerJoin(document, eq(documentLink.documentId, document.id))
        .leftJoin(membership, eq(document.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
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

  /**
   * T-112: аудитор проставляет review-статус доказательства (evidence tracker).
   * Ревьюит только аудитор (category auditor/external_auditor) — capability
   * ортогональна RBAC (как approver политик, T-052). Внешний аудитор — только
   * в пределах своего scope.
   */
  async setReviewStatus(
    actor: { tenantId: string; userId: string; ip?: string | null },
    linkId: string,
    reviewStatus: EvidenceReviewStatus,
  ) {
    const category = await resolveActorCategory(this.dbService, actor.tenantId, actor.userId);
    if (category !== 'auditor' && category !== 'external_auditor') {
      throw new ForbiddenException('Ревьюить доказательства может только аудитор');
    }
    const [link] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          id: documentLink.id,
          entityType: documentLink.entityType,
          entityId: documentLink.entityId,
          reviewStatus: documentLink.reviewStatus,
        })
        .from(documentLink)
        .innerJoin(document, eq(documentLink.documentId, document.id))
        .where(eq(documentLink.id, linkId)),
    );
    if (!link) throw new NotFoundException('Привязка документа не найдена');

    const scope = await resolveAuditorScope(this.dbService, actor.tenantId, actor.userId);
    if (scope !== null) {
      const { subsidiaryId, subsidiaryBound } = await this.entitySubsidiary(
        actor.tenantId,
        link.entityType,
        link.entityId,
      );
      if (subsidiaryBound && (subsidiaryId === null || !scope.includes(subsidiaryId))) {
        throw new ForbiddenException('Доказательство вне вашего scope');
      }
    }

    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx.update(documentLink).set({ reviewStatus }).where(eq(documentLink.id, linkId)),
    );
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'document_link.review_status_changed',
      entityType: 'document_link',
      entityId: linkId,
      before: { reviewStatus: link.reviewStatus },
      after: { reviewStatus },
    });
    return { id: linkId, reviewStatus };
  }

  /** Авторизованное скачивание: метаданные под RLS, тело — из S3. */
  async content(
    tenantId: string,
    userId: string,
    documentId: string,
  ): Promise<{ filename: string; stored: StoredObject }> {
    const [doc] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(document)
        .where(and(eq(document.id, documentId), isNull(document.deletedAt))),
    );
    if (!doc) throw new NotFoundException(`Документ ${documentId} не найден`);
    // T-122: скачивание по ID режется auditor-scope так же, как список (T-111).
    // Внешний аудитор со scope качает документ, только если он привязан к
    // видимой ему сущности (дочка в scope или библиотечная/глобальная).
    const scope = await resolveAuditorScope(this.dbService, tenantId, userId);
    if (scope !== null && !(await this.documentVisibleInScope(tenantId, documentId, scope))) {
      throw new NotFoundException(`Документ ${documentId} не найден`);
    }
    if (doc.status === 'needs_document' || !doc.storageKey) {
      throw new BadRequestException('Файл ещё не загружен (needs_document)');
    }
    const stored = await this.storage.get(doc.storageKey);
    if (!stored) throw new NotFoundException('Файл отсутствует в хранилище');
    return { filename: doc.filename, stored };
  }

  /**
   * T-122: виден ли документ внешнему аудитору со scope. Документ виден, если
   * хотя бы одна его привязка ведёт к библиотечной/глобальной сущности
   * (`subsidiaryBound=false`, видна всем) ИЛИ к дочке в scope. Без привязок или
   * только к дочкам вне scope — не виден.
   */
  private async documentVisibleInScope(
    tenantId: string,
    documentId: string,
    scope: string[],
  ): Promise<boolean> {
    const links = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ entityType: documentLink.entityType, entityId: documentLink.entityId })
        .from(documentLink)
        .where(eq(documentLink.documentId, documentId)),
    );
    for (const link of links) {
      const { subsidiaryId, subsidiaryBound } = await this.entitySubsidiary(
        tenantId,
        link.entityType,
        link.entityId,
      );
      if (!subsidiaryBound) return true;
      if (subsidiaryId !== null && scope.includes(subsidiaryId)) return true;
    }
    return false;
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
