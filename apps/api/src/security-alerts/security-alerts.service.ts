import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { securityAlert } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
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
  ) {}

  async create(
    actor: Actor,
    input: { title: string; source?: string; severity?: string; connectorId?: string },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(securityAlert)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          source: input.source ?? null,
          severity: input.severity ?? 'medium',
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
      after: { title: created.title, severity: created.severity },
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

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(securityAlert)
        .where(isNull(securityAlert.deletedAt))
        .orderBy(desc(securityAlert.createdAt)),
    );
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      source: a.source,
      severity: a.severity,
      status: a.status,
    }));
  }
}
