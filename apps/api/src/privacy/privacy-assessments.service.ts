import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { document, documentLink, privacyAssessment, processingActivity } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Workflow DPIA (T-075): draft→in_progress→completed. */
const FLOW: Record<string, string[]> = {
  draft: ['in_progress'],
  in_progress: ['completed'],
};

@Injectable()
export class PrivacyAssessmentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      processingActivityId: string;
      title: string;
      riskLevel?: string;
      necessityNote?: string;
      mitigations?: unknown[];
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [pa] = await tx
        .select({ id: processingActivity.id })
        .from(processingActivity)
        .where(
          and(
            eq(processingActivity.id, input.processingActivityId),
            isNull(processingActivity.deletedAt),
          ),
        );
      if (!pa)
        throw new BadRequestException(
          `Операция обработки ${input.processingActivityId} не найдена`,
        );
      const [row] = await tx
        .insert(privacyAssessment)
        .values({
          tenantId: actor.tenantId,
          processingActivityId: input.processingActivityId,
          title: input.title,
          riskLevel: input.riskLevel ?? 'medium',
          necessityNote: input.necessityNote ?? null,
          mitigations: input.mitigations ?? [],
        })
        .returning();
      if (!row) throw new Error('DPIA не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'privacy_assessment.created',
      entityType: 'privacy_assessment',
      entityId: created.id,
      after: { riskLevel: created.riskLevel },
    });
    return { id: created.id, status: created.status, riskLevel: created.riskLevel };
  }

  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(privacyAssessment)
        .where(and(eq(privacyAssessment.id, id), isNull(privacyAssessment.deletedAt)));
      if (!row) throw new NotFoundException(`DPIA ${id} не найдена`);
      if (!FLOW[row.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      await tx.update(privacyAssessment).set({ status: to }).where(eq(privacyAssessment.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'privacy_assessment.status_changed',
      entityType: 'privacy_assessment',
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
        .from(privacyAssessment)
        .where(isNull(privacyAssessment.deletedAt))
        .orderBy(desc(privacyAssessment.createdAt)),
    );
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      riskLevel: a.riskLevel,
      status: a.status,
      processingActivityId: a.processingActivityId,
    }));
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(privacyAssessment)
        .where(and(eq(privacyAssessment.id, id), isNull(privacyAssessment.deletedAt)));
      if (!row) throw new NotFoundException(`DPIA ${id} не найдена`);
      const docs = await tx
        .select({ id: document.id, filename: document.filename, relation: documentLink.relation })
        .from(documentLink)
        .innerJoin(document, eq(documentLink.documentId, document.id))
        .where(
          and(
            eq(documentLink.entityType, 'privacy_assessment'),
            eq(documentLink.entityId, id),
            isNull(document.deletedAt),
          ),
        );
      return {
        id: row.id,
        title: row.title,
        riskLevel: row.riskLevel,
        necessityNote: row.necessityNote,
        mitigations: row.mitigations,
        status: row.status,
        processingActivityId: row.processingActivityId,
        documents: docs,
      };
    });
  }
}
