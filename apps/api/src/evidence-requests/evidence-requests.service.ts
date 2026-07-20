import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { document, engagement, evidenceRequest, membership, user } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveActorCategory, resolveAuditorScope } from '../rbac/auditor-scope';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string | null;
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
    if (category !== 'auditor' && category !== 'external_auditor') {
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
