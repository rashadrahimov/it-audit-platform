import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DEFAULT_LOCALE, resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  asset,
  control,
  device,
  finding,
  incident,
  incidentEvent,
  incidentLink,
  membership,
  risk,
  securityAlert,
  user,
  vendor,
  vulnerability,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { dueDateFor, SlaConfigService } from '../sla-config/sla-config.service';
import {
  allowedTransitions,
  canTransition,
  formatIncidentRef,
  isIncidentStatus,
  PHASE_COLUMN,
  type IncidentLinkType,
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
  /** T-IR03: только инциденты, где я commander. */
  mine?: boolean;
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
    private readonly notifications: NotificationsService,
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
      return {
        ref: row.ref,
        before: from,
        after: to,
        commanderMembershipId: row.commanderMembershipId,
      };
    });
    // T-IR03: закрытие — событие для commander'а (если закрывал не он сам)
    if (
      to === 'closed' &&
      result.commanderMembershipId &&
      result.commanderMembershipId !== authorMembershipId
    ) {
      await this.notifications.create(actor, {
        recipientMembershipId: result.commanderMembershipId,
        type: 'info',
        title: `Инцидент ${result.ref} закрыт`,
        body: note,
      });
    }
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

  /**
   * T-IR03: назначить incident commander — ведущего разбирательство.
   * Назначенный получает уведомление и видит инцидент в «Моей работе».
   */
  async assign(actor: Actor, id: string, commanderMembershipId: string) {
    await this.assertMembership(actor.tenantId, commanderMembershipId);
    const authorMembershipId = await this.myMembershipId(actor.tenantId, actor.userId);
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(incident)
        .where(and(eq(incident.id, id), isNull(incident.deletedAt)));
      if (!row) throw new NotFoundException(`Инцидент ${id} не найден`);
      await tx.update(incident).set({ commanderMembershipId }).where(eq(incident.id, id));
      await tx.insert(incidentEvent).values({
        tenantId: actor.tenantId,
        incidentId: id,
        kind: 'action',
        note: 'Назначен incident commander',
        authorMembershipId,
      });
      return { ref: row.ref, before: row.commanderMembershipId };
    });
    if (commanderMembershipId !== authorMembershipId) {
      await this.notifications.create(actor, {
        recipientMembershipId: commanderMembershipId,
        type: 'action',
        title: `Вы ведёте инцидент ${result.ref}`,
      });
    }
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'incident.assigned',
      entityType: 'incident',
      entityId: id,
      before: { commanderMembershipId: result.before },
      after: { commanderMembershipId },
    });
    return { id, ref: result.ref, commanderMembershipId };
  }

  /**
   * T-IR02: связать инцидент с сущностью платформы. Существование цели проверяем
   * под RLS тенанта — чужую сущность связать нельзя (изоляция MTE-04).
   */
  async addLink(actor: Actor, id: string, entityType: IncidentLinkType, entityId: string) {
    return this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [inc] = await tx
        .select({ id: incident.id })
        .from(incident)
        .where(and(eq(incident.id, id), isNull(incident.deletedAt)));
      if (!inc) throw new NotFoundException(`Инцидент ${id} не найден`);
      const exists = await this.entityExists(tx, entityType, entityId);
      if (!exists) throw new BadRequestException(`${entityType} ${entityId} не найден в тенанте`);
      const [existing] = await tx
        .select({ id: incidentLink.id })
        .from(incidentLink)
        .where(
          and(
            eq(incidentLink.incidentId, id),
            eq(incidentLink.entityType, entityType),
            eq(incidentLink.entityId, entityId),
          ),
        );
      if (existing) return { linked: false, linkId: existing.id };
      const [row] = await tx
        .insert(incidentLink)
        .values({ tenantId: actor.tenantId, incidentId: id, entityType, entityId })
        .returning();
      await tx.insert(incidentEvent).values({
        tenantId: actor.tenantId,
        incidentId: id,
        kind: 'action',
        note: `Связано: ${entityType}`,
        authorMembershipId: await this.myMembershipId(actor.tenantId, actor.userId),
      });
      return { linked: true, linkId: row!.id };
    });
  }

  async removeLink(actor: Actor, id: string, linkId: string) {
    return this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: incidentLink.id })
        .from(incidentLink)
        .where(and(eq(incidentLink.id, linkId), eq(incidentLink.incidentId, id)));
      if (!row) throw new NotFoundException(`Связь ${linkId} не найдена`);
      await tx.delete(incidentLink).where(eq(incidentLink.id, linkId));
      return { removed: true };
    });
  }

  /** Проверка существования цели связи в тенанте (для каждого типа — своя таблица). */
  private async entityExists(
    tx: Parameters<Parameters<DbService['withTenant']>[1]>[0],
    entityType: IncidentLinkType,
    entityId: string,
  ): Promise<boolean> {
    const table = {
      security_alert: securityAlert,
      vulnerability,
      asset,
      device,
      risk,
      control,
      vendor,
      finding,
    }[entityType];
    const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, entityId));
    return Boolean(row);
  }

  /** Заголовки связанных сущностей — по одному запросу на тип. */
  private async resolveLinks(tenantId: string, incidentId: string, locale: Locale) {
    const links = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(incidentLink)
        .where(eq(incidentLink.incidentId, incidentId))
        .orderBy(asc(incidentLink.createdAt)),
    );
    if (links.length === 0) return [];
    const titles = new Map<string, string>();
    const byType = new Map<string, string[]>();
    for (const l of links) {
      byType.set(l.entityType, [...(byType.get(l.entityType) ?? []), l.entityId]);
    }
    await this.dbService.withTenant(tenantId, async (tx) => {
      for (const [type, ids] of byType) {
        const key = (entityId: string) => `${type}:${entityId}`;
        switch (type as IncidentLinkType) {
          case 'security_alert': {
            const rows = await tx
              .select({ id: securityAlert.id, title: securityAlert.title })
              .from(securityAlert)
              .where(inArray(securityAlert.id, ids));
            rows.forEach((r) => titles.set(key(r.id), r.title));
            break;
          }
          case 'vulnerability': {
            const rows = await tx
              .select({ id: vulnerability.id, title: vulnerability.title })
              .from(vulnerability)
              .where(inArray(vulnerability.id, ids));
            rows.forEach((r) => titles.set(key(r.id), r.title));
            break;
          }
          case 'asset': {
            const rows = await tx
              .select({ id: asset.id, name: asset.name })
              .from(asset)
              .where(inArray(asset.id, ids));
            rows.forEach((r) => titles.set(key(r.id), r.name));
            break;
          }
          case 'device': {
            const rows = await tx
              .select({ id: device.id, name: device.name })
              .from(device)
              .where(inArray(device.id, ids));
            rows.forEach((r) => titles.set(key(r.id), r.name));
            break;
          }
          case 'vendor': {
            const rows = await tx
              .select({ id: vendor.id, name: vendor.name })
              .from(vendor)
              .where(inArray(vendor.id, ids));
            rows.forEach((r) => titles.set(key(r.id), r.name));
            break;
          }
          case 'risk': {
            const rows = await tx
              .select({ id: risk.id, titleI18n: risk.titleI18n })
              .from(risk)
              .where(inArray(risk.id, ids));
            rows.forEach((r) => titles.set(key(r.id), resolveLocalized(r.titleI18n, locale)));
            break;
          }
          case 'finding': {
            const rows = await tx
              .select({ id: finding.id, titleI18n: finding.titleI18n })
              .from(finding)
              .where(inArray(finding.id, ids));
            rows.forEach((r) => titles.set(key(r.id), resolveLocalized(r.titleI18n, locale)));
            break;
          }
          case 'control': {
            const rows = await tx
              .select({ id: control.id, ref: control.ref, objectiveI18n: control.objectiveI18n })
              .from(control)
              .where(inArray(control.id, ids));
            rows.forEach((r) =>
              titles.set(key(r.id), `${r.ref} — ${resolveLocalized(r.objectiveI18n, locale)}`),
            );
            break;
          }
        }
      }
    });
    return links.map((l) => ({
      linkId: l.id,
      entityType: l.entityType,
      entityId: l.entityId,
      title: titles.get(`${l.entityType}:${l.entityId}`) ?? null,
    }));
  }

  async list(tenantId: string, filters?: IncidentFilters, userId?: string) {
    const conds = [isNull(incident.deletedAt)];
    if (filters?.mine) {
      const meId = userId ? await this.myMembershipId(tenantId, userId) : null;
      // без membership «моих» инцидентов быть не может — отдаём пустой список
      if (!meId) return [];
      conds.push(eq(incident.commanderMembershipId, meId));
    }
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

  async detail(tenantId: string, id: string, locale: Locale = DEFAULT_LOCALE) {
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
    const links = await this.resolveLinks(tenantId, id, locale);
    const i = row.incident;
    return {
      ...this.toListItem(i, row.commanderName),
      description: i.description,
      links,
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
