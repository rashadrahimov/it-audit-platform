import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { vulnerability } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Lifecycle уязвимости (T-062): open→remediating→resolved. */
const FLOW: Record<string, string[]> = {
  open: ['remediating', 'resolved'],
  remediating: ['resolved', 'open'],
};

@Injectable()
export class VulnerabilitiesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      title: string;
      cve?: string;
      severity?: string;
      description?: string;
      dueDate?: string;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(vulnerability)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          cve: input.cve ?? null,
          severity: input.severity ?? 'medium',
          description: input.description ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        })
        .returning();
      if (!row) throw new Error('Уязвимость не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vulnerability.created',
      entityType: 'vulnerability',
      entityId: created.id,
      after: { title: created.title, severity: created.severity },
    });
    return { id: created.id, status: created.status, slaStatus: created.slaStatus };
  }

  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(vulnerability)
        .where(and(eq(vulnerability.id, id), isNull(vulnerability.deletedAt)));
      if (!row) throw new NotFoundException(`Уязвимость ${id} не найдена`);
      if (!FLOW[row.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      await tx
        .update(vulnerability)
        .set({ status: to, resolvedAt: to === 'resolved' ? sql`now()` : row.resolvedAt })
        .where(eq(vulnerability.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vulnerability.status_changed',
      entityType: 'vulnerability',
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
        .from(vulnerability)
        .where(isNull(vulnerability.deletedAt))
        .orderBy(desc(vulnerability.createdAt)),
    );
    return rows.map((v) => ({
      id: v.id,
      title: v.title,
      cve: v.cve,
      severity: v.severity,
      status: v.status,
      slaStatus: v.slaStatus,
      dueDate: v.dueDate?.toISOString() ?? null,
    }));
  }
}
