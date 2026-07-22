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

type EvidenceGapReason =
  'awaiting_upload' | 'draft' | 'overdue' | 'renewal_due' | 'unlinked' | 'flagged';
export type DocumentIntakeBucket = 'office_pdf' | 'spreadsheet' | 'image_ocr' | 'config_logs';
type EvidenceRescanQueue =
  'extraction' | 'ocr' | 'aiFindingDrafts' | 'evidenceRequestFollowUp' | 'reportReadinessRefresh';

export interface DocumentIntakeFormat {
  bucket: DocumentIntakeBucket;
  examples: string[];
  extensions: string[];
  mimeHints: string[];
  queues: EvidenceRescanQueue[];
  requiresOcr: boolean;
  canDraftFindings: true;
  humanReviewRequired: true;
  draftOnly: true;
}

export const DOCUMENT_INTAKE_FORMATS: DocumentIntakeFormat[] = [
  {
    bucket: 'office_pdf',
    examples: ['policies', 'procedures', 'reports', 'standards', 'network diagrams'],
    extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx'],
    mimeHints: ['application/pdf', 'wordprocessingml', 'presentationml', 'msword'],
    queues: ['extraction', 'aiFindingDrafts'],
    requiresOcr: false,
    canDraftFindings: true,
    humanReviewRequired: true,
    draftOnly: true,
  },
  {
    bucket: 'spreadsheet',
    examples: ['risk registers', 'asset exports', 'access matrices', 'inventories'],
    extensions: ['xls', 'xlsx', 'xlsm', 'csv', 'tsv'],
    mimeHints: ['spreadsheet', 'csv', 'tab-separated-values'],
    queues: ['extraction', 'aiFindingDrafts'],
    requiresOcr: false,
    canDraftFindings: true,
    humanReviewRequired: true,
    draftOnly: true,
  },
  {
    bucket: 'image_ocr',
    examples: ['scans', 'screenshots', 'photos', 'signed evidence'],
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'heic'],
    mimeHints: ['image/'],
    queues: ['extraction', 'ocr', 'aiFindingDrafts'],
    requiresOcr: true,
    canDraftFindings: true,
    humanReviewRequired: true,
    draftOnly: true,
  },
  {
    bucket: 'config_logs',
    examples: ['configs', 'logs', 'JSON/YAML/XML exports', 'technical evidence'],
    extensions: ['log', 'txt', 'json', 'yaml', 'yml', 'xml', 'conf', 'cfg', 'ini'],
    mimeHints: ['text/', 'application/json', 'application/xml', 'yaml'],
    queues: ['extraction', 'aiFindingDrafts'],
    requiresOcr: false,
    canDraftFindings: true,
    humanReviewRequired: true,
    draftOnly: true,
  },
];

export interface EvidenceRescanLink {
  entityType: string;
  entityId?: string;
  relation: string;
  reviewStatus: string;
}

export interface EvidenceRescanTrigger {
  required: boolean;
  reason: 'linked_evidence_upload' | 'draft_review_gate' | 'link_required';
  bucket: DocumentIntakeBucket;
  humanReviewGate: 'auditor_review_required';
  draftOnly: true;
  impactedTargets: Array<{
    entityType: string;
    entityId?: string;
    relation: string;
    reviewStatus: string;
  }>;
  queues: Record<EvidenceRescanQueue, boolean>;
  explanation: string;
}

export interface EvidenceRescanQueueAuditPayload {
  sourceAction: string;
  documentId: string;
  queued: boolean;
  reason: EvidenceRescanTrigger['reason'];
  bucket: EvidenceRescanTrigger['bucket'];
  enabledQueues: EvidenceRescanQueue[];
  impactedTargets: EvidenceRescanTrigger['impactedTargets'];
  humanReviewGate: EvidenceRescanTrigger['humanReviewGate'];
  draftOnly: true;
  explanation: string;
}

const DOCUMENT_SEARCH_TEXT_LIMIT = 200_000;
const SEARCHABLE_TEXT_EXTENSIONS = new Set([
  'txt',
  'log',
  'json',
  'xml',
  'yaml',
  'yml',
  'csv',
  'tsv',
  'conf',
  'cfg',
  'ini',
  'md',
]);

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}

export function extractSearchableDocumentText(file: {
  buffer: Buffer;
  originalName: string;
  mime: string;
}): {
  extractedText: string | null;
  extractionStatus: 'indexed' | 'pending';
  extractedChars: number;
  truncated: boolean;
  reason: 'text_inline' | 'binary_pipeline_pending';
} {
  const ext = extensionOf(file.originalName);
  const mime = file.mime.toLowerCase();
  const textLike =
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('yaml') ||
    mime.includes('csv') ||
    SEARCHABLE_TEXT_EXTENSIONS.has(ext);
  if (!textLike) {
    return {
      extractedText: null,
      extractionStatus: 'pending',
      extractedChars: 0,
      truncated: false,
      reason: 'binary_pipeline_pending',
    };
  }
  const normalized = file.buffer
    .toString('utf8')
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  const truncated = normalized.length > DOCUMENT_SEARCH_TEXT_LIMIT;
  const extractedText = truncated ? normalized.slice(0, DOCUMENT_SEARCH_TEXT_LIMIT) : normalized;
  return {
    extractedText,
    extractionStatus: 'indexed',
    extractedChars: extractedText.length,
    truncated,
    reason: 'text_inline',
  };
}

export function documentIntakeBucket(filename: string, mime: string): DocumentIntakeBucket {
  const ext = extensionOf(filename);
  const normalizedMime = mime.toLowerCase();
  if (
    normalizedMime.includes('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'heic'].includes(ext)
  ) {
    return 'image_ocr';
  }
  if (
    normalizedMime.includes('spreadsheet') ||
    normalizedMime.includes('csv') ||
    ['xls', 'xlsx', 'xlsm', 'csv', 'tsv'].includes(ext)
  ) {
    return 'spreadsheet';
  }
  if (['log', 'txt', 'json', 'yaml', 'yml', 'xml', 'conf', 'cfg', 'ini'].includes(ext)) {
    return 'config_logs';
  }
  return 'office_pdf';
}

export function supportedDocumentIntakeFormats() {
  return {
    count: DOCUMENT_INTAKE_FORMATS.length,
    formats: DOCUMENT_INTAKE_FORMATS,
    sourceTypes: [
      'policy',
      'procedure',
      'configuration',
      'log',
      'diagram',
      'evidence',
      'register',
      'export',
    ],
    queues: ['extraction', 'ocr', 'aiFindingDrafts'] satisfies EvidenceRescanQueue[],
    evidenceGrounded: true,
    humanReviewRequired: true,
    draftOnly: true,
  };
}

export function evidenceRescanTriggerForDocument(
  doc: { filename: string; mime: string; status: string },
  links: EvidenceRescanLink[],
): EvidenceRescanTrigger {
  const bucket = documentIntakeBucket(doc.filename, doc.mime);
  const linked = links.length > 0;
  const active = doc.status === 'active';
  const acceptedOrReady = links.some(
    (link) => link.reviewStatus === 'accepted' || link.reviewStatus === 'ready',
  );
  const flagged = links.some((link) => link.reviewStatus === 'flagged');
  const reason =
    active && linked
      ? 'linked_evidence_upload'
      : doc.status === 'draft'
        ? 'draft_review_gate'
        : 'link_required';
  const queues = {
    extraction: active && linked,
    ocr: active && linked && bucket === 'image_ocr',
    aiFindingDrafts: active && linked && !flagged,
    evidenceRequestFollowUp: !active || !linked,
    reportReadinessRefresh: active && linked && acceptedOrReady,
  };
  const enabledQueues = Object.entries(queues)
    .filter(([, enabled]) => enabled)
    .map(([queue]) => queue);
  return {
    required: enabledQueues.length > 0,
    reason,
    bucket,
    humanReviewGate: 'auditor_review_required',
    draftOnly: true,
    impactedTargets: links.map((link) => ({
      entityType: link.entityType,
      entityId: link.entityId,
      relation: link.relation,
      reviewStatus: link.reviewStatus,
    })),
    queues,
    explanation:
      enabledQueues.length > 0
        ? `Evidence upload queued ${enabledQueues.join(', ')} while keeping AI outputs draft-only until auditor review.`
        : 'Evidence upload is recorded, but no re-scan queue is enabled yet.',
  };
}

export function evidenceRescanQueueAuditPayload(
  documentId: string,
  trigger: EvidenceRescanTrigger,
  sourceAction: string,
): EvidenceRescanQueueAuditPayload {
  const enabledQueues = Object.entries(trigger.queues)
    .filter(([, enabled]) => enabled)
    .map(([queue]) => queue as EvidenceRescanQueue);
  return {
    sourceAction,
    documentId,
    queued: enabledQueues.length > 0,
    reason: trigger.reason,
    bucket: trigger.bucket,
    enabledQueues,
    impactedTargets: trigger.impactedTargets,
    humanReviewGate: trigger.humanReviewGate,
    draftOnly: trigger.draftOnly,
    explanation: trigger.explanation,
  };
}

/** Документы-доказательства (T-034): метаданные + S3 (T-042), полиморфные привязки. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly storage: FileStorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  intakeFormats() {
    return supportedDocumentIntakeFormats();
  }

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
    const searchText = extractSearchableDocumentText(file);

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
              extractedText: searchText.extractedText,
              extractionStatus: searchText.extractionStatus,
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
            extractedText: searchText.extractedText,
            extractionStatus: searchText.extractionStatus,
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
          extractedText: searchText.extractedText,
          extractionStatus: searchText.extractionStatus,
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
    const links = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          entityType: documentLink.entityType,
          entityId: documentLink.entityId,
          relation: documentLink.relation,
          reviewStatus: documentLink.reviewStatus,
        })
        .from(documentLink)
        .where(eq(documentLink.documentId, result.row.id)),
    );
    const rescanTrigger = evidenceRescanTriggerForDocument(result.row, links);

    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: result.action,
      entityType: 'document',
      entityId: result.row.id,
      after: {
        filename: result.row.filename,
        sha256,
        version: result.row.version,
        searchExtraction: {
          status: searchText.extractionStatus,
          chars: searchText.extractedChars,
          truncated: searchText.truncated,
          reason: searchText.reason,
        },
        rescanTrigger,
      },
    });
    await this.recordRescanQueued(actor, result.row.id, rescanTrigger, result.action);
    return { ...result.row, rescanTrigger };
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
          extractedText: null,
          extractionStatus: 'pending_upload',
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
    const rescanTrigger = await this.loadRescanTrigger(actor.tenantId, documentId);
    await this.recordRescanQueued(actor, documentId, rescanTrigger, 'document.published');
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
    if (created) {
      const rescanTrigger = await this.loadRescanTrigger(actor.tenantId, documentId);
      await this.recordRescanQueued(actor, documentId, rescanTrigger, 'document.linked');
    }
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

  /**
   * T-H45: управленческая сводка готовности evidence. Она собирается только из
   * уже имеющихся метаданных: жизненный цикл документа, привязки, review-статусы
   * и сроки обновления. Никаких AI/внешних вызовов — безопасный read-only слой.
   */
  async readinessSummary(tenantId: string) {
    const now = new Date();
    const dueSoonCutoff = new Date(now);
    dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 30);

    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const docs = await tx
        .select({
          id: document.id,
          filename: document.filename,
          status: document.status,
          category: document.category,
          renewBy: document.renewBy,
          createdAt: document.createdAt,
        })
        .from(document)
        .where(isNull(document.deletedAt))
        .orderBy(desc(document.createdAt));
      const links = await tx
        .select({
          id: documentLink.id,
          documentId: documentLink.documentId,
          reviewStatus: documentLink.reviewStatus,
        })
        .from(documentLink)
        .innerJoin(document, eq(documentLink.documentId, document.id))
        .where(isNull(document.deletedAt));
      return { docs, links };
    });

    const linksByDoc = new Map<string, typeof data.links>();
    for (const link of data.links) {
      const existing = linksByDoc.get(link.documentId) ?? [];
      existing.push(link);
      linksByDoc.set(link.documentId, existing);
    }

    const totalDocuments = data.docs.length;
    const activeDocuments = data.docs.filter((d) => d.status === 'active').length;
    const requestedDocuments = data.docs.filter((d) => d.status === 'needs_document').length;
    const draftDocuments = data.docs.filter((d) => d.status === 'draft').length;
    const overdueDocuments = data.docs.filter(
      (d) => d.status === 'overdue' || (d.renewBy !== null && d.renewBy < now),
    ).length;
    const renewalDueSoon = data.docs.filter(
      (d) => d.renewBy !== null && d.renewBy >= now && d.renewBy <= dueSoonCutoff,
    ).length;
    const linkedDocuments = data.docs.filter((d) => (linksByDoc.get(d.id)?.length ?? 0) > 0).length;
    const unlinkedDocuments = Math.max(totalDocuments - linkedDocuments, 0);

    const acceptedLinks = data.links.filter((l) => l.reviewStatus === 'accepted').length;
    const readyLinks = data.links.filter((l) => l.reviewStatus === 'ready').length;
    const flaggedLinks = data.links.filter((l) => l.reviewStatus === 'flagged').length;
    const notReadyLinks = data.links.filter((l) => l.reviewStatus === 'not_ready').length;
    const reviewedEvidenceLinks = acceptedLinks + readyLinks + flaggedLinks;

    const coveragePercent =
      totalDocuments === 0 ? 0 : Math.round((linkedDocuments / totalDocuments) * 100);
    const reviewAcceptancePercent =
      data.links.length === 0 ? 0 : Math.round((acceptedLinks / data.links.length) * 100);
    const readyPercent =
      totalDocuments === 0
        ? 0
        : Math.round(
            ((activeDocuments - overdueDocuments - flaggedLinks - unlinkedDocuments) /
              totalDocuments) *
              100,
          );

    const topGaps: {
      id: string;
      filename: string;
      status: string;
      category: string | null;
      renewBy: string | null;
      reason: EvidenceGapReason;
    }[] = [];

    const pushGap = (doc: (typeof data.docs)[number], reason: EvidenceGapReason) => {
      if (topGaps.some((g) => g.id === doc.id && g.reason === reason)) return;
      topGaps.push({
        id: doc.id,
        filename: doc.filename,
        status: doc.status,
        category: doc.category,
        renewBy: doc.renewBy?.toISOString() ?? null,
        reason,
      });
    };

    for (const doc of data.docs) {
      const links = linksByDoc.get(doc.id) ?? [];
      if (doc.status === 'needs_document') pushGap(doc, 'awaiting_upload');
      else if (doc.status === 'draft') pushGap(doc, 'draft');
      else if (doc.status === 'overdue' || (doc.renewBy !== null && doc.renewBy < now)) {
        pushGap(doc, 'overdue');
      } else if (doc.renewBy !== null && doc.renewBy <= dueSoonCutoff) {
        pushGap(doc, 'renewal_due');
      } else if (links.length === 0) {
        pushGap(doc, 'unlinked');
      } else if (links.some((l) => l.reviewStatus === 'flagged')) {
        pushGap(doc, 'flagged');
      }
      if (topGaps.length >= 6) break;
    }

    return {
      generatedAt: now.toISOString(),
      totalDocuments,
      activeDocuments,
      requestedDocuments,
      draftDocuments,
      overdueDocuments,
      renewalDueSoon,
      linkedDocuments,
      unlinkedDocuments,
      evidenceLinks: data.links.length,
      acceptedLinks,
      readyLinks,
      flaggedLinks,
      notReadyLinks,
      reviewedEvidenceLinks,
      coveragePercent,
      reviewAcceptancePercent,
      readyPercent: Math.max(0, Math.min(100, readyPercent)),
      topGaps,
    };
  }

  /**
   * T-H59: continuous evidence re-scan plan. This is intentionally read-only:
   * it turns uploaded/linked document metadata into an operational queue so the
   * UI can explain which AI/reporting/control surfaces should be refreshed next.
   */
  async rescanPlan(tenantId: string) {
    const now = new Date();
    const recentSince = new Date(now);
    recentSince.setDate(recentSince.getDate() - 14);

    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          status: document.status,
          category: document.category,
          createdAt: document.createdAt,
          renewBy: document.renewBy,
          entityType: documentLink.entityType,
          entityId: documentLink.entityId,
          relation: documentLink.relation,
          reviewStatus: documentLink.reviewStatus,
        })
        .from(document)
        .leftJoin(documentLink, eq(documentLink.documentId, document.id))
        .where(isNull(document.deletedAt))
        .orderBy(desc(document.createdAt)),
    );

    const documentsById = new Map<
      string,
      {
        id: string;
        filename: string;
        mime: string;
        status: string;
        category: string | null;
        createdAt: Date;
        renewBy: Date | null;
        links: Array<{
          entityType: string;
          entityId: string;
          relation: string;
          reviewStatus: string;
        }>;
      }
    >();

    for (const row of rows) {
      const doc = documentsById.get(row.id) ?? {
        id: row.id,
        filename: row.filename,
        mime: row.mime,
        status: row.status,
        category: row.category,
        createdAt: row.createdAt,
        renewBy: row.renewBy,
        links: [],
      };
      if (row.entityType && row.entityId && row.relation && row.reviewStatus) {
        doc.links.push({
          entityType: row.entityType,
          entityId: row.entityId,
          relation: row.relation,
          reviewStatus: row.reviewStatus,
        });
      }
      documentsById.set(row.id, doc);
    }

    const docs = [...documentsById.values()];
    const uploadedDocs = docs.filter((d) => d.status !== 'needs_document');
    const activeLinkedDocs = docs.filter((d) => d.status === 'active' && d.links.length > 0);
    const recentlyChangedDocs = uploadedDocs.filter((d) => d.createdAt >= recentSince);
    const recentlyChangedLinkedDocs = recentlyChangedDocs.filter((d) => d.links.length > 0);
    const unlinkedUploadedDocs = uploadedDocs.filter((d) => d.links.length === 0);
    const draftDocs = docs.filter((d) => d.status === 'draft');
    const requestedDocs = docs.filter((d) => d.status === 'needs_document');
    const ocrDocs = activeLinkedDocs.filter(
      (d) => documentIntakeBucket(d.filename, d.mime) === 'image_ocr',
    );
    const acceptedOrReadyDocs = activeLinkedDocs.filter((d) =>
      d.links.some((l) => l.reviewStatus === 'accepted' || l.reviewStatus === 'ready'),
    );
    const flaggedDocs = activeLinkedDocs.filter((d) =>
      d.links.some((l) => l.reviewStatus === 'flagged'),
    );

    const impacted = activeLinkedDocs.reduce(
      (acc, doc) => {
        for (const link of doc.links) {
          if (link.entityType === 'engagement') acc.engagements.add(link.entityId);
          else if (link.entityType === 'control') acc.controls.add(link.entityId);
          else if (link.entityType === 'response') acc.responses.add(link.entityId);
          else if (link.entityType === 'checklist_item') acc.checklistItems.add(link.entityId);
          else acc.otherEvidencePools.add(`${link.entityType}:${link.entityId}`);
        }
        return acc;
      },
      {
        engagements: new Set<string>(),
        controls: new Set<string>(),
        responses: new Set<string>(),
        checklistItems: new Set<string>(),
        otherEvidencePools: new Set<string>(),
      },
    );

    const blockers = {
      requestedDocuments: requestedDocs.length,
      draftDocuments: draftDocs.length,
      unlinkedDocuments: unlinkedUploadedDocs.length,
      flaggedDocuments: flaggedDocs.length,
      ocrDocuments: ocrDocs.length,
    };
    const blockingTotal = Object.values(blockers).reduce((sum, n) => sum + n, 0);
    const status =
      activeLinkedDocs.length === 0
        ? 'blocked'
        : recentlyChangedLinkedDocs.length > 0
          ? 'hot'
          : blockingTotal > 0
            ? 'watch'
            : 'ready';
    const allPendingItems = docs
      .map((doc) => {
        const rescanTrigger = evidenceRescanTriggerForDocument(doc, doc.links);
        const enabledQueues = Object.entries(rescanTrigger.queues)
          .filter(([, enabled]) => enabled)
          .map(([queue]) => queue as EvidenceRescanQueue);
        const activeLinked = doc.status === 'active' && doc.links.length > 0;
        const needsOcr = rescanTrigger.queues.ocr;
        const dueAt = new Date(doc.createdAt);
        dueAt.setHours(dueAt.getHours() + (activeLinked ? (needsOcr ? 48 : 24) : 72));
        return {
          id: doc.id,
          filename: doc.filename,
          status: doc.status,
          category: doc.category,
          createdAt: doc.createdAt.toISOString(),
          bucket: rescanTrigger.bucket,
          reason: rescanTrigger.reason,
          queueStatus: activeLinked ? ('queued' as const) : ('waiting_for_evidence' as const),
          enabledQueues,
          impactedTargets: rescanTrigger.impactedTargets,
          humanReviewGate: rescanTrigger.humanReviewGate,
          draftOnly: rescanTrigger.draftOnly,
          dueAt: dueAt.toISOString(),
          explanation: rescanTrigger.explanation,
        };
      })
      .filter((item) => item.enabledQueues.length > 0)
      .sort((a, b) => {
        const statusScore = (item: { queueStatus: string }) =>
          item.queueStatus === 'queued' ? 0 : 1;
        const scoreDiff = statusScore(a) - statusScore(b);
        if (scoreDiff !== 0) return scoreDiff;
        if (b.enabledQueues.length !== a.enabledQueues.length) {
          return b.enabledQueues.length - a.enabledQueues.length;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    const pendingItems = allPendingItems.slice(0, 8);

    return {
      generatedAt: now.toISOString(),
      windowDays: 14,
      status,
      recentUploads: recentlyChangedDocs.length,
      recentLinkedUploads: recentlyChangedLinkedDocs.length,
      impacted: {
        engagements: impacted.engagements.size,
        controls: impacted.controls.size,
        responses: impacted.responses.size,
        checklistItems: impacted.checklistItems.size,
        otherEvidencePools: impacted.otherEvidencePools.size,
      },
      queues: {
        extraction: activeLinkedDocs.length,
        ocr: ocrDocs.length,
        aiFindingDrafts: Math.max(activeLinkedDocs.length - flaggedDocs.length, 0),
        evidenceRequestFollowUp: requestedDocs.length + draftDocs.length,
        reportReadinessRefresh: acceptedOrReadyDocs.length,
      },
      pendingRescans: allPendingItems.length,
      pendingItems,
      blockers,
      recentTriggers: recentlyChangedDocs.slice(0, 5).map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        category: doc.category,
        createdAt: doc.createdAt.toISOString(),
        bucket: documentIntakeBucket(doc.filename, doc.mime),
        rescanTrigger: evidenceRescanTriggerForDocument(doc, doc.links),
        links: doc.links.map((link) => ({
          entityType: link.entityType,
          relation: link.relation,
          reviewStatus: link.reviewStatus,
        })),
      })),
    };
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
    if (category !== 'auditor' && category !== 'internal' && category !== 'external_auditor') {
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

  private async loadRescanTrigger(
    tenantId: string,
    documentId: string,
  ): Promise<EvidenceRescanTrigger> {
    const { doc, links } = await this.dbService.withTenant(tenantId, async (tx) => {
      const [doc] = await tx
        .select({
          filename: document.filename,
          mime: document.mime,
          status: document.status,
        })
        .from(document)
        .where(and(eq(document.id, documentId), isNull(document.deletedAt)));
      if (!doc) throw new NotFoundException(`Документ ${documentId} не найден`);
      const links = await tx
        .select({
          entityType: documentLink.entityType,
          entityId: documentLink.entityId,
          relation: documentLink.relation,
          reviewStatus: documentLink.reviewStatus,
        })
        .from(documentLink)
        .where(eq(documentLink.documentId, documentId));
      return { doc, links };
    });
    return evidenceRescanTriggerForDocument(doc, links);
  }

  private async recordRescanQueued(
    actor: Actor,
    documentId: string,
    trigger: EvidenceRescanTrigger,
    sourceAction: string,
  ): Promise<void> {
    const payload = evidenceRescanQueueAuditPayload(documentId, trigger, sourceAction);
    if (!payload.queued) return;
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'document.rescan_queued',
      entityType: 'document',
      entityId: documentId,
      after: payload,
    });
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
