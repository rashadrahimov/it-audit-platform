import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { document, documentLink, vendor, vendorAssessment } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Состояния vendor-assessment (T-061): requested→in_progress→completed. */
const FLOW: Record<string, string[]> = {
  requested: ['in_progress'],
  in_progress: ['completed'],
};

@Injectable()
export class VendorAssessmentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    vendorId: string,
    input: { type?: string; dueDate?: string; ownerMembershipId?: string },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [v] = await tx
        .select({ id: vendor.id })
        .from(vendor)
        .where(and(eq(vendor.id, vendorId), isNull(vendor.deletedAt)));
      if (!v) throw new NotFoundException(`Вендор ${vendorId} не найден`);
      const [row] = await tx
        .insert(vendorAssessment)
        .values({
          vendorId,
          type: input.type ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          ownerMembershipId: input.ownerMembershipId ?? null,
        })
        .returning();
      if (!row) throw new Error('Assessment не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vendor_assessment.created',
      entityType: 'vendor_assessment',
      entityId: created.id,
      after: { vendorId, type: created.type },
    });
    return { id: created.id, state: created.state, evidenceStatus: created.evidenceStatus };
  }

  async transition(actor: Actor, id: string, to: string, recommendation?: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx.select().from(vendorAssessment).where(eq(vendorAssessment.id, id));
      if (!row) throw new NotFoundException(`Assessment ${id} не найден`);
      if (!FLOW[row.state]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.state} → ${to} недопустим`);
      }
      // evidence_status подтверждается наличием прикреплённых документов
      const [doc] = await tx
        .select({ id: documentLink.id })
        .from(documentLink)
        .where(and(eq(documentLink.entityType, 'vendor_assessment'), eq(documentLink.entityId, id)))
        .limit(1);
      await tx
        .update(vendorAssessment)
        .set({
          state: to,
          recommendation: recommendation ?? row.recommendation,
          evidenceStatus: doc ? 'provided' : row.evidenceStatus,
        })
        .where(eq(vendorAssessment.id, id));
      return { before: row.state, after: to, evidence: doc ? 'provided' : row.evidenceStatus };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vendor_assessment.state_changed',
      entityType: 'vendor_assessment',
      entityId: id,
      before: { state: result.before },
      after: { state: result.after },
    });
    return result;
  }

  async listForVendor(tenantId: string, vendorId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(vendorAssessment)
        .where(eq(vendorAssessment.vendorId, vendorId))
        .orderBy(desc(vendorAssessment.createdAt)),
    );
    // документы каждого assessment — через полиморфную привязку (T-034)
    return Promise.all(
      rows.map(async (a) => {
        const docs = await this.dbService.withTenant(tenantId, (tx) =>
          tx
            .select({ id: document.id, filename: document.filename })
            .from(documentLink)
            .innerJoin(document, eq(documentLink.documentId, document.id))
            .where(
              and(
                eq(documentLink.entityType, 'vendor_assessment'),
                eq(documentLink.entityId, a.id),
                isNull(document.deletedAt),
              ),
            ),
        );
        return {
          id: a.id,
          type: a.type,
          state: a.state,
          evidenceStatus: a.evidenceStatus,
          recommendation: a.recommendation,
          dueDate: a.dueDate?.toISOString() ?? null,
          documents: docs,
        };
      }),
    );
  }
}
