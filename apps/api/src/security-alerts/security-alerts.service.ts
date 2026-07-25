import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { asset, incident, incidentLink, securityAlert } from '../db/schema';
import { IncidentsService } from '../incidents/incidents.service';
import { dueDateFor, SlaConfigService } from '../sla-config/sla-config.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface AlertFilters {
  status?: string;
  severity?: string;
  category?: string;
  assetId?: string;
}

/** Жизненный цикл алерта (T-064): new→triaged→closed. */
const FLOW: Record<string, string[]> = {
  new: ['triaged', 'closed'],
  triaged: ['closed'],
};

@Injectable()
export class SecurityAlertsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly slaConfig: SlaConfigService,
    private readonly incidents: IncidentsService,
  ) {}

  async create(
    actor: Actor,
    input: {
      title: string;
      source?: string;
      severity?: string;
      category?: string;
      assetId?: string;
      connectorId?: string;
    },
  ) {
    const severity = input.severity ?? 'medium';
    // T-V40: resolution SLA — дедлайн по окну severity тенанта
    const windows = await this.slaConfig.configOf(actor.tenantId);
    const dueDate = dueDateFor(windows, severity);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(securityAlert)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          source: input.source ?? null,
          severity,
          category: input.category ?? null,
          assetId: input.assetId ?? null,
          dueDate,
          connectorId: input.connectorId ?? null,
        })
        .returning();
      if (!row) throw new Error('Алерт не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'security_alert.created',
      entityType: 'security_alert',
      entityId: created.id,
      after: { title: created.title, severity: created.severity, category: created.category },
    });
    return { id: created.id, status: created.status };
  }

  async transition(actor: Actor, id: string, to: string, note?: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(securityAlert)
        .where(and(eq(securityAlert.id, id), isNull(securityAlert.deletedAt)));
      if (!row) throw new NotFoundException(`Алерт ${id} не найден`);
      if (!FLOW[row.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      await tx
        .update(securityAlert)
        .set({
          status: to,
          triageNote: note ?? row.triageNote,
          triagedAt: to === 'triaged' ? sql`now()` : row.triagedAt,
          closedAt: to === 'closed' ? sql`now()` : row.closedAt,
          // закрытый алерт больше не «горит» по SLA
          slaStatus: to === 'closed' ? 'ok' : row.slaStatus,
        })
        .where(eq(securityAlert.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'security_alert.status_changed',
      entityType: 'security_alert',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  /**
   * T-IR02: эскалация алерта в инцидент (ADR-0024) — алерт остаётся сигналом,
   * инцидент становится разбирательством. Данные не дублируются, а связываются.
   */
  async escalate(actor: Actor, id: string, input?: { severity?: string; note?: string }) {
    const alert = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(securityAlert)
        .where(and(eq(securityAlert.id, id), isNull(securityAlert.deletedAt)));
      if (!row) throw new NotFoundException(`Алерт ${id} не найден`);
      // Повторная эскалация запрещена, пока прошлый инцидент не закрыт
      const [open] = await tx
        .select({ ref: incident.ref })
        .from(incidentLink)
        .innerJoin(incident, eq(incident.id, incidentLink.incidentId))
        .where(
          and(
            eq(incidentLink.entityType, 'security_alert'),
            eq(incidentLink.entityId, id),
            isNull(incident.deletedAt),
          ),
        );
      if (open) {
        throw new BadRequestException(`Алерт уже эскалирован в инцидент ${open.ref}`);
      }
      return row;
    });
    const created = await this.incidents.create(actor, {
      title: alert.title,
      description: input?.note,
      severity: input?.severity ?? alert.severity,
      category: alert.category ?? undefined,
      source: 'alert',
      detectedAt: alert.createdAt.toISOString(),
    });
    await this.incidents.addLink(actor, created.id, 'security_alert', id);
    // Сигнал разобран — переводим в triaged, если он ещё new
    if (alert.status === 'new') {
      await this.transition(actor, id, 'triaged', `Эскалирован в инцидент ${created.ref}`);
    }
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'security_alert.escalated',
      entityType: 'security_alert',
      entityId: id,
      after: { incidentId: created.id, ref: created.ref },
    });
    return { incidentId: created.id, ref: created.ref, severity: created.severity };
  }

  async list(tenantId: string, filters?: AlertFilters) {
    const conds = [isNull(securityAlert.deletedAt)];
    if (filters?.status) conds.push(eq(securityAlert.status, filters.status));
    if (filters?.severity) conds.push(eq(securityAlert.severity, filters.severity));
    if (filters?.category) conds.push(eq(securityAlert.category, filters.category));
    if (filters?.assetId) conds.push(eq(securityAlert.assetId, filters.assetId));
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: securityAlert.id,
          title: securityAlert.title,
          source: securityAlert.source,
          severity: securityAlert.severity,
          status: securityAlert.status,
          category: securityAlert.category,
          assetId: securityAlert.assetId,
          assetName: asset.name,
          dueDate: securityAlert.dueDate,
          slaStatus: securityAlert.slaStatus,
        })
        .from(securityAlert)
        .leftJoin(asset, eq(asset.id, securityAlert.assetId))
        .where(and(...conds))
        .orderBy(desc(securityAlert.createdAt)),
    );
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      source: a.source,
      severity: a.severity,
      status: a.status,
      category: a.category,
      assetId: a.assetId,
      assetName: a.assetName,
      dueDate: a.dueDate ? a.dueDate.toISOString() : null,
      // закрытый алерт не показываем как overdue/soon
      slaStatus: a.status === 'closed' ? 'ok' : a.slaStatus,
    }));
  }
}
