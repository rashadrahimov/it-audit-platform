import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DEFAULT_LOCALE, resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  checklistItem,
  document,
  documentLink,
  engagement,
  evidenceRequest,
  membership,
  response,
  user,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveActorCategory, resolveAuditorScope } from '../rbac/auditor-scope';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string | null;
}

export interface EvidenceRequestSuggestion {
  checklistItemId: string;
  ref: string;
  domainCode: string | null;
  controlClause: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  confidence: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  source: 'ai_drl';
  reviewRequired: true;
}

interface SuggestionChecklistItem {
  id: string;
  ref: string;
  domainCode: string | null;
  objective: string;
  question: string;
  hasResponse: boolean;
  complianceStatus: string | null;
}

function evidenceKind(question: string): string {
  const q = question.toLowerCase();
  if (
    /(access|user|account|mfa|privilege|iam|identity|доступ|уч[её]т|пользовател|giriş|hesab)/u.test(
      q,
    )
  ) {
    return 'access control evidence';
  }
  if (/(backup|restore|recovery|резерв|восстанов|bərpa|ehtiyat)/u.test(q)) {
    return 'backup and recovery evidence';
  }
  if (/(incident|alert|security event|инцидент|hadisə|insident)/u.test(q)) {
    return 'incident response evidence';
  }
  if (/(vendor|supplier|third|outsourc|поставщик|вендор|təchizatçı|vendor)/u.test(q)) {
    return 'third-party oversight evidence';
  }
  if (/(change|release|deployment|изменен|релиз|dəyişiklik|buraxılış)/u.test(q)) {
    return 'change management evidence';
  }
  if (/(log|monitor|siem|журнал|лог|monitorinq|jurnal)/u.test(q)) {
    return 'logging and monitoring evidence';
  }
  if (/(policy|procedure|standard|политик|процедур|siyasət|prosedur)/u.test(q)) {
    return 'policy or procedure evidence';
  }
  return 'control evidence';
}

function acceptanceCriteria(kind: string, locale: Locale): string[] {
  if (locale === 'ru') {
    return [
      `Документ явно покрывает ${kind} за проверяемый период и область аудита.`,
      'В файле видны дата, владелец/источник и критерии выборки или выгрузки.',
      'Доказательство можно связать с конкретным контролем без дополнительных устных пояснений.',
    ];
  }
  if (locale === 'az') {
    return [
      `Sənəd audit dövrü və əhatə dairəsi üzrə ${kind} mövzusunu açıq şəkildə əhatə edir.`,
      'Faylda tarix, sahib/mənbə və seçim və ya ixrac meyarları görünür.',
      'Sübut əlavə şifahi izah olmadan konkret nəzarətlə əlaqələndirilə bilir.',
    ];
  }
  return [
    `The document clearly covers ${kind} for the audit period and scope.`,
    'The file shows date, owner/source, and sampling or export criteria.',
    'The evidence can be tied to the specific control without extra verbal explanation.',
  ];
}

function priorityFor(
  item: SuggestionChecklistItem,
  kind: string,
): EvidenceRequestSuggestion['priority'] {
  const q = `${item.question} ${item.objective} ${kind}`.toLowerCase();
  const highSignal =
    /(access|privilege|mfa|backup|restore|incident|vendor|third-party|siem|доступ|резерв|инцидент|giriş|bərpa|insident|təchizatçı)/u.test(
      q,
    );
  if (
    !item.hasResponse ||
    ['non_compliant', 'partially_compliant'].includes(item.complianceStatus ?? '')
  ) {
    return 'high';
  }
  if (highSignal) return 'high';
  return item.complianceStatus === 'not_applicable' ? 'low' : 'medium';
}

function confidenceFor(
  item: SuggestionChecklistItem,
  priority: EvidenceRequestSuggestion['priority'],
): number {
  const base = item.hasResponse ? 0.74 : 0.84;
  const statusBoost =
    item.complianceStatus &&
    item.complianceStatus !== 'not_applicable' &&
    item.complianceStatus !== 'compliant'
      ? 0.06
      : 0;
  const priorityBoost = priority === 'high' ? 0.04 : priority === 'low' ? -0.06 : 0;
  return Math.min(0.94, Math.max(0.58, Number((base + statusBoost + priorityBoost).toFixed(2))));
}

export function buildSuggestion(
  item: SuggestionChecklistItem,
  locale: Locale,
): EvidenceRequestSuggestion {
  const kind = evidenceKind(item.question);
  const controlClause = [item.domainCode, item.ref].filter(Boolean).join(' · ') || item.ref;
  const priority = priorityFor(item, kind);
  const confidence = confidenceFor(item, priority);
  const title =
    locale === 'ru'
      ? `${item.ref}: запросить доказательство контроля`
      : locale === 'az'
        ? `${item.ref}: nəzarət sübutunu tələb et`
        : `${item.ref}: request ${kind}`;
  const description =
    locale === 'ru'
      ? `Пожалуйста, предоставьте доказательство по контролю ${controlClause}: ${item.question}. Подойдёт файл, отчёт, выгрузка, политика или скриншот, подтверждающий выполнение контроля.`
      : locale === 'az'
        ? `Zəhmət olmasa ${controlClause} nəzarəti üzrə sübut təqdim edin: ${item.question}. Kontrolun icrasını təsdiqləyən fayl, hesabat, ixrac, siyasət və ya ekran görüntüsü uyğundur.`
        : `Please provide ${kind} for control ${controlClause}: ${item.question}. A file, report, export, policy, or screenshot that supports the control is acceptable.`;
  const reason =
    locale === 'ru'
      ? `К пункту ${controlClause} ещё не привязано доказательство${item.hasResponse ? ' для ответа аудируемого' : ''}.`
      : locale === 'az'
        ? `${controlClause} bəndinə hələ sübut bağlanmayıb${item.hasResponse ? ' (auditee cavabı üzrə)' : ''}.`
        : `No evidence is linked to checklist item ${controlClause}${item.hasResponse ? ' or its response' : ''}.`;
  return {
    checklistItemId: item.id,
    ref: item.ref,
    domainCode: item.domainCode,
    controlClause,
    title,
    description,
    acceptanceCriteria: acceptanceCriteria(kind, locale),
    confidence,
    priority,
    reason,
    source: 'ai_drl',
    reviewRequired: true,
  };
}

/**
 * Request list / PBC (T-114): аудитор запрашивает доказательство у клиента,
 * auditee прикладывает документ, аудитор принимает. Уведомления обеим сторонам
 * (reuse NotificationsService, T-096). requested → provided → accepted.
 */
@Injectable()
export class EvidenceRequestsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    actor: Actor,
    input: {
      engagementId: string;
      title: string;
      description?: string;
      assigneeMembershipId?: string;
      dueDate?: Date | null;
    },
  ) {
    await this.assertAuditor(actor);
    const subsidiaryId = await this.engagementSubsidiary(actor.tenantId, input.engagementId);
    if (subsidiaryId === undefined) throw new BadRequestException('Engagement не найден');
    await this.assertInScope(actor, subsidiaryId);

    const requestedByMembershipId = await this.membershipId(actor.tenantId, actor.userId);
    if (!requestedByMembershipId) throw new ForbiddenException('У актора нет membership в тенанте');
    if (input.assigneeMembershipId) {
      await this.assertMembership(actor.tenantId, input.assigneeMembershipId);
    }

    const row = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [created] = await tx
        .insert(evidenceRequest)
        .values({
          tenantId: actor.tenantId,
          engagementId: input.engagementId,
          title: input.title,
          description: input.description ?? null,
          requestedByMembershipId,
          assigneeMembershipId: input.assigneeMembershipId ?? null,
          dueDate: input.dueDate ?? null,
        })
        .returning();
      return created!;
    });

    if (input.assigneeMembershipId) {
      await this.notifications.create(
        { tenantId: actor.tenantId, userId: actor.userId },
        {
          recipientMembershipId: input.assigneeMembershipId,
          title: `Запрос доказательства: ${input.title}`,
          type: 'action',
          body: input.description,
        },
      );
    }
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'evidence_request.created',
      entityType: 'evidence_request',
      entityId: row.id,
      after: { engagementId: row.engagementId, title: row.title, status: row.status },
    });
    return { id: row.id, status: row.status };
  }

  /** T-H37: auto-generated DRL — подсказки request-list из чеклиста без evidence. */
  async suggestions(
    actor: Actor,
    engagementId: string,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<{ count: number; items: EvidenceRequestSuggestion[] }> {
    await this.assertAuditor(actor);
    const subsidiaryId = await this.engagementSubsidiary(actor.tenantId, engagementId);
    if (subsidiaryId === undefined) throw new BadRequestException('Engagement не найден');
    await this.assertInScope(actor, subsidiaryId);

    const data = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: checklistItem.id,
          ref: checklistItem.ref,
          domainCode: checklistItem.domainCode,
          objectiveI18n: checklistItem.objectiveI18n,
          questionI18n: checklistItem.questionI18n,
        })
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, engagementId))
        .orderBy(asc(checklistItem.order));
      const itemIds = items.map((i) => i.id);
      const responses =
        itemIds.length > 0
          ? await tx
              .select({
                id: response.id,
                checklistItemId: response.checklistItemId,
                complianceStatus: response.complianceStatus,
              })
              .from(response)
              .where(inArray(response.checklistItemId, itemIds))
          : [];
      const responseIds = responses.map((r) => r.id);
      const linkedTargets = [
        ...itemIds.map((id) => ({ type: 'checklist_item', id })),
        ...responseIds.map((id) => ({ type: 'response', id })),
      ];
      const links =
        linkedTargets.length > 0
          ? await tx
              .select({
                entityType: documentLink.entityType,
                entityId: documentLink.entityId,
              })
              .from(documentLink)
              .where(
                inArray(
                  documentLink.entityId,
                  linkedTargets.map((t) => t.id),
                ),
              )
          : [];
      const requests = await tx
        .select({ title: evidenceRequest.title, description: evidenceRequest.description })
        .from(evidenceRequest)
        .where(eq(evidenceRequest.engagementId, engagementId));
      return { items, responses, links, requests };
    });

    const responseByItem = new Map(data.responses.map((r) => [r.checklistItemId, r]));
    const covered = new Set(
      data.links.map((l) =>
        l.entityType === 'checklist_item' || l.entityType === 'response'
          ? `${l.entityType}:${l.entityId}`
          : '',
      ),
    );
    const existingRequestText = data.requests
      .map((r) => `${r.title}\n${r.description ?? ''}`.toLowerCase())
      .join('\n');
    const suggestions = data.items
      .filter((item) => {
        const responseRow = responseByItem.get(item.id);
        const hasEvidence =
          covered.has(`checklist_item:${item.id}`) ||
          (responseRow ? covered.has(`response:${responseRow.id}`) : false);
        const hasRequest =
          existingRequestText.includes(`ai-drl:${item.id}`) ||
          existingRequestText.includes(item.ref.toLowerCase());
        return !hasEvidence && !hasRequest;
      })
      .map((item) =>
        buildSuggestion(
          {
            id: item.id,
            ref: item.ref,
            domainCode: item.domainCode,
            objective: resolveLocalized(item.objectiveI18n, locale),
            question: resolveLocalized(item.questionI18n, locale),
            hasResponse: responseByItem.has(item.id),
            complianceStatus: responseByItem.get(item.id)?.complianceStatus ?? null,
          },
          locale,
        ),
      )
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority] || b.confidence - a.confidence;
      })
      .slice(0, 12);
    return { count: suggestions.length, items: suggestions };
  }

  /** Auditee прикладывает документ → provided; уведомляет запросившего аудитора. */
  async provide(actor: Actor, id: string, documentId: string) {
    const req = await this.load(actor.tenantId, id);
    if (req.status !== 'requested') {
      throw new BadRequestException(`Нельзя приложить: статус ${req.status}`);
    }
    await this.assertDocument(actor.tenantId, documentId);
    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .update(evidenceRequest)
        .set({ documentId, status: 'provided' })
        .where(eq(evidenceRequest.id, id)),
    );
    await this.notifications.create(
      { tenantId: actor.tenantId, userId: actor.userId },
      {
        recipientMembershipId: req.requestedByMembershipId,
        title: `Доказательство предоставлено: ${req.title}`,
        type: 'info',
      },
    );
    await this.log(actor, id, 'requested', 'provided');
    return { id, status: 'provided' as const };
  }

  /** Аудитор принимает предоставленное доказательство → accepted. */
  async accept(actor: Actor, id: string) {
    await this.assertAuditor(actor);
    const req = await this.load(actor.tenantId, id);
    if (req.status !== 'provided') {
      throw new BadRequestException(`Принять можно только provided (сейчас ${req.status})`);
    }
    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx.update(evidenceRequest).set({ status: 'accepted' }).where(eq(evidenceRequest.id, id)),
    );
    if (req.assigneeMembershipId) {
      await this.notifications.create(
        { tenantId: actor.tenantId, userId: actor.userId },
        {
          recipientMembershipId: req.assigneeMembershipId,
          title: `Доказательство принято: ${req.title}`,
          type: 'info',
        },
      );
    }
    await this.log(actor, id, 'provided', 'accepted');
    return { id, status: 'accepted' as const };
  }

  /** Список запросов по engagement + счётчик открытых (requested/provided). */
  async list(tenantId: string, engagementId: string) {
    const assigneeUser = alias(user, 'assignee_user');
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: evidenceRequest.id,
          title: evidenceRequest.title,
          description: evidenceRequest.description,
          status: evidenceRequest.status,
          documentId: evidenceRequest.documentId,
          dueDate: evidenceRequest.dueDate,
          assignee: assigneeUser.fullName,
          createdAt: evidenceRequest.createdAt,
        })
        .from(evidenceRequest)
        .leftJoin(membership, eq(evidenceRequest.assigneeMembershipId, membership.id))
        .leftJoin(assigneeUser, eq(membership.userId, assigneeUser.id))
        .where(eq(evidenceRequest.engagementId, engagementId))
        .orderBy(asc(evidenceRequest.createdAt)),
    );
    const open = rows.filter((r) => r.status !== 'accepted').length;
    return {
      open,
      total: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        documentId: r.documentId,
        dueDate: r.dueDate?.toISOString() ?? null,
        assignee: r.assignee,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private async assertAuditor(actor: Actor): Promise<void> {
    const category = await resolveActorCategory(this.dbService, actor.tenantId, actor.userId);
    if (category !== 'auditor' && category !== 'internal' && category !== 'external_auditor') {
      throw new ForbiddenException('Запрос доказательства ведёт только аудитор');
    }
  }

  private async assertInScope(actor: Actor, subsidiaryId: string): Promise<void> {
    const scope = await resolveAuditorScope(this.dbService, actor.tenantId, actor.userId);
    if (scope !== null && !scope.includes(subsidiaryId)) {
      throw new ForbiddenException('Engagement вне вашего scope');
    }
  }

  private async load(tenantId: string, id: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(evidenceRequest).where(eq(evidenceRequest.id, id)),
    );
    if (!row) throw new BadRequestException('Запрос не найден');
    return row;
  }

  private async engagementSubsidiary(
    tenantId: string,
    engagementId: string,
  ): Promise<string | undefined> {
    const [e] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ s: engagement.subsidiaryId })
        .from(engagement)
        .where(eq(engagement.id, engagementId)),
    );
    return e?.s;
  }

  private async assertMembership(tenantId: string, membershipId: string): Promise<void> {
    const [m] = await this.dbService.db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.id, membershipId), eq(membership.tenantId, tenantId)));
    if (!m) throw new BadRequestException('assigneeMembershipId не найден в тенанте');
  }

  private async assertDocument(tenantId: string, documentId: string): Promise<void> {
    const [d] = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select({ id: document.id }).from(document).where(eq(document.id, documentId)),
    );
    if (!d) throw new BadRequestException('documentId не найден в тенанте');
  }

  private async membershipId(tenantId: string, userId: string): Promise<string | null> {
    const [m] = await this.dbService.db
      .select({ id: membership.id })
      .from(membership)
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.tenantId, tenantId),
          eq(membership.status, 'active'),
        ),
      );
    return m?.id ?? null;
  }

  private async log(actor: Actor, id: string, from: string, to: string): Promise<void> {
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'evidence_request.status_changed',
      entityType: 'evidence_request',
      entityId: id,
      before: { status: from },
      after: { status: to },
    });
  }
}
