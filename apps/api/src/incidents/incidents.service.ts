import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { incident, incidentEvent, membership, user } from '../db/schema';
import { dueDateFor, SlaConfigService } from '../sla-config/sla-config.service';
import {
  allowedTransitions,
  canTransition,
  formatIncidentRef,
  isIncidentStatus,
  PHASE_COLUMN,
  type IncidentStatus,
} from './incident-flow';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface IncidentFilters {
  status?: string;
  severity?: string;
  category?: string;
  commanderMembershipId?: string;
}

export interface CreateIncidentInput {
  title: string;
  description?: string;
  severity?: string;
  category?: string;
  source?: string;
  detectedAt?: string;
  commanderMembershipId?: string;
}

export interface UpdateIncidentInput {
  title?: string;
  description?: string | null;
  severity?: string;
  category?: string | null;
  commanderMembershipId?: string | null;
}

/**
 * Инциденты ИБ (T-IR01, ADR-0024): карточка + append-only таймлайн.
 * Каждый переход фазы механически пишет событие — постмортем строится из таймлайна.
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly slaConfig: SlaConfigService,
  ) {}

  /** Membership актора в тенанте — автор записей таймлайна. */
  private async myMembershipId(tenantId: string, userId: string): Promise<string | null> {
    const [me] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, userId), eq(membership.tenantId, tenantId))),
    );
    return me?.id ?? null;
  }

  /** Проверка, что commander — membership этого тенанта (изоляция MTE-04). */
  private async assertMembership(tenantId: string, membershipId: string): Promise<void> {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.id, membershipId), eq(membership.tenantId, tenantId))),
    );
    if (!row) throw new BadRequestException(`Membership ${membershipId} не найден в тенанте`);
  }

  async create(actor: Actor, input: CreateIncidentInput) {
    const severity = input.severity ?? 'medium';
    if (input.commanderMembershipId) {
      await this.assertMembership(actor.tenantId, input.commanderMembershipId);
    }
    const windows = await this.slaConfig.configOf(actor.tenantId);
    const detectedAt = input.detectedAt ? new Date(input.detectedAt) : new Date();
    if (Number.isNaN(detectedAt.getTime())) {
      throw new BadRequestException('detectedAt — некорректная дата');
    }
    // Дедлайн резолюции считаем от момента обнаружения, а не от заведения записи:
    // поздно заведённый инцидент не должен выглядеть уложившимся в срок.
    const dueDate = dueDateFor(windows, severity, detectedAt);
    const authorMembershipId = await this.myMembershipId(actor.tenantId, actor.userId);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      // Нумерация сквозная по тенанту; гонку ловит уникальный индекс (tenant_id, ref).
      const [maxRow] = await tx
        .select({
          maxSeq: sql<number>`coalesce(max(case when ${incident.ref} ~ '^INC-[0-9]+$'
            then substring(${incident.ref} from 5)::int else 0 end), 0)`,
        })
        .from(incident);
      const nextSeq = Number(maxRow?.maxSeq ?? 0) + 1;
      const [row] = await tx
        .insert(incident)
        .values({
          tenantId: actor.tenantId,
          ref: formatIncidentRef(nextSeq),
          title: input.title,
          description: input.description ?? null,
          severity,
          status: 'detected',
          category: input.category ?? null,
          source: input.source ?? 'manual',
          detectedAt,
          commanderMembershipId: input.commanderMembershipId ?? null,
          dueDate,
        })
        .returning();
      if (!row) throw new Error('Инцидент не создался');
      await tx.insert(incidentEvent).values({
        tenantId: actor.tenantId,
        incidentId: row.id,
        kind: 'status_change',
        fromStatus: null,
        toStatus: 'detected',
        note: 'Инцидент зафиксирован',
        authorMembershipId,
      });
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'incident.created',
      entityType: 'incident',
      entityId: created.id,
      after: { ref: created.ref, title: created.title, severity: created.severity },
    });
    return {
      id: created.id,
      ref: created.ref,
      status: created.status,
      severity: created.severity,
      dueDate: created.dueDate?.toISOString() ?? null,
    };
  }

  async transition(actor: Actor, id: string, to: string, note?: string) {
    if (!isIncidentStatus(to)) throw new BadRequestException(`Неизвестный статус ${to}`);
    const authorMembershipId = await this.myMembershipId(actor.tenantId, actor.userId);
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(incident)
        .where(and(eq(incident.id, id), isNull(incident.deletedAt)));
      if (!row) throw new NotFoundException(`Инцидент ${id} не найден`);
      const from = row.status as IncidentStatus;
      if (!isIncidentStatus(from) || !canTransition(from, to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      const phase = PHASE_COLUMN[to];
      await tx
        .update(incident)
        .set({
          status: to,
          ...(phase ? { [phase]: sql`now()` } : {}),
          // закрытый инцидент больше не «горит» по SLA
          slaStatus: to === 'closed' ? 'ok' : row.slaStatus,
        })
        .where(eq(incident.id, id));
      await tx.insert(incidentEvent).values({
        tenantId: actor.tenantId,
        incidentId: id,
        kind: 'status_change',
        fromStatus: from,
        toStatus: to,
        note: note ?? null,
        authorMembershipId,
      });
      return { ref: row.ref, before: from, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'incident.status_changed',
      entityType: 'incident',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  /** Ручная запись в таймлайн (заметка/действие) — без смены статуса. */
  async addEvent(actor: Actor, id: string, kind: string, note: string) {
    const authorMembershipId = await this.myMembershipId(actor.tenantId, actor.userId);
    return this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: incident.id })
        .from(incident)
        .where(and(eq(incident.id, id), isNull(incident.deletedAt)));
      if (!row) throw new NotFoundException(`Инцидент ${id} не найден`);
      const [event] = await tx
        .insert(incidentEvent)
        .values({
          tenantId: actor.tenantId,
          incidentId: id,
          kind,
          note,
          authorMembershipId,
        })
        .returning();
      return { id: event!.id, kind: event!.kind, at: event!.at.toISOString() };
    });
  }

  async update(actor: Actor, id: string, input: UpdateIncidentInput) {
    if (input.commanderMembershipId) {
      await this.assertMembership(actor.tenantId, input.commanderMembershipId);
    }
    const windows = await this.slaConfig.configOf(actor.tenantId);
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(incident)
        .where(and(eq(incident.id, id), isNull(incident.deletedAt)));
      if (!row) throw new NotFoundException(`Инцидент ${id} не найден`);
      const severityChanged = input.severity !== undefined && input.severity !== row.severity;
      await tx
        .update(incident)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.severity !== undefined ? { severity: input.severity } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.commanderMembershipId !== undefined
            ? { commanderMembershipId: input.commanderMembershipId }
            : {}),
          // severity задаёт окно резолюции — дедлайн пересчитываем от момента обнаружения
          ...(severityChanged && row.status !== 'closed'
            ? { dueDate: dueDateFor(windows, input.severity!, row.detectedAt) }
            : {}),
        })
        .where(eq(incident.id, id));
      return { before: row, severityChanged };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'incident.updated',
      entityType: 'incident',
      entityId: id,
      before: {
        title: result.before.title,
        severity: result.before.severity,
        category: result.before.category,
        commanderMembershipId: result.before.commanderMembershipId,
      },
      after: input,
    });
    return { id, updated: true };
  }

  async list(tenantId: string, filters?: IncidentFilters) {
    const conds = [isNull(incident.deletedAt)];
    if (filters?.status) conds.push(eq(incident.status, filters.status));
    if (filters?.severity) conds.push(eq(incident.severity, filters.severity));
    if (filters?.category) conds.push(eq(incident.category, filters.category));
    if (filters?.commanderMembershipId) {
      conds.push(eq(incident.commanderMembershipId, filters.commanderMembershipId));
    }
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ incident: incident, commanderName: user.fullName })
        .from(incident)
        .leftJoin(membership, eq(incident.commanderMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(...conds))
        .orderBy(desc(incident.detectedAt)),
    );
    return rows.map((r) => this.toListItem(r.incident, r.commanderName));
  }

  async detail(tenantId: string, id: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ incident: incident, commanderName: user.fullName })
        .from(incident)
        .leftJoin(membership, eq(incident.commanderMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(eq(incident.id, id), isNull(incident.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Инцидент ${id} не найден`);
    const timeline = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ event: incidentEvent, authorName: user.fullName })
        .from(incidentEvent)
        .leftJoin(membership, eq(incidentEvent.authorMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(eq(incidentEvent.incidentId, id))
        .orderBy(asc(incidentEvent.at)),
    );
    const i = row.incident;
    return {
      ...this.toListItem(i, row.commanderName),
      description: i.description,
      source: i.source,
      phases: {
        detectedAt: i.detectedAt.toISOString(),
        triagedAt: i.triagedAt?.toISOString() ?? null,
        containedAt: i.containedAt?.toISOString() ?? null,
        eradicatedAt: i.eradicatedAt?.toISOString() ?? null,
        recoveredAt: i.recoveredAt?.toISOString() ?? null,
        closedAt: i.closedAt?.toISOString() ?? null,
      },
      allowedTransitions: isIncidentStatus(i.status) ? allowedTransitions(i.status) : [],
      timeline: timeline.map((t) => ({
        id: t.event.id,
        kind: t.event.kind,
        fromStatus: t.event.fromStatus,
        toStatus: t.event.toStatus,
        note: t.event.note,
        authorName: t.authorName,
        at: t.event.at.toISOString(),
      })),
    };
  }

  private toListItem(i: typeof incident.$inferSelect, commanderName: string | null) {
    return {
      id: i.id,
      ref: i.ref,
      title: i.title,
      severity: i.severity,
      status: i.status,
      category: i.category,
      source: i.source,
      commanderMembershipId: i.commanderMembershipId,
      commanderName,
      detectedAt: i.detectedAt.toISOString(),
      dueDate: i.dueDate?.toISOString() ?? null,
      // закрытый инцидент не показываем как overdue/due_soon
      slaStatus: i.status === 'closed' ? 'ok' : i.slaStatus,
    };
  }
}
