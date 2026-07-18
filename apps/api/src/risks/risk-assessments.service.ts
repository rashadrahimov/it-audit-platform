import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { document, documentLink, riskAssessment } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Сессии оценки рисков (T-059, RSK-01): workflow draft→in_progress→completed. */
const FLOW: Record<string, string[]> = {
  draft: ['in_progress'],
  in_progress: ['completed'],
};

@Injectable()
export class RiskAssessmentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      title: string;
      period?: string;
      methodologyNote?: string;
      scope?: Record<string, unknown>;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(riskAssessment)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          period: input.period ?? null,
          methodologyNote: input.methodologyNote ?? null,
          scope: input.scope ?? {},
        })
        .returning();
      if (!row) throw new Error('Сессия не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk_assessment.created',
      entityType: 'risk_assessment',
      entityId: created.id,
      after: { title: created.title },
    });
    return { id: created.id, status: created.status };
  }

  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(riskAssessment)
        .where(and(eq(riskAssessment.id, id), isNull(riskAssessment.deletedAt)));
      if (!row) throw new NotFoundException(`Сессия ${id} не найдена`);
      if (!FLOW[row.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      await tx.update(riskAssessment).set({ status: to }).where(eq(riskAssessment.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk_assessment.status_changed',
      entityType: 'risk_assessment',
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
        .from(riskAssessment)
        .where(isNull(riskAssessment.deletedAt))
        .orderBy(desc(riskAssessment.createdAt)),
    );
    return rows.map((r) => ({ id: r.id, title: r.title, period: r.period, status: r.status }));
  }

  async detail(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(riskAssessment)
        .where(and(eq(riskAssessment.id, id), isNull(riskAssessment.deletedAt)));
      if (!row) throw new NotFoundException(`Сессия ${id} не найдена`);
      // документы сессии через полиморфную привязку (T-034)
      const docs = await tx
        .select({ id: document.id, filename: document.filename, relation: documentLink.relation })
        .from(documentLink)
        .innerJoin(document, eq(documentLink.documentId, document.id))
        .where(
          and(
            eq(documentLink.entityType, 'risk_assessment'),
            eq(documentLink.entityId, id),
            isNull(document.deletedAt),
          ),
        );
      return {
        id: row.id,
        title: row.title,
        period: row.period,
        methodologyNote: row.methodologyNote,
        scope: row.scope,
        status: row.status,
        documents: docs,
      };
    });
  }
}
