import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  document,
  documentLink,
  membership,
  privacyAssessment,
  processingActivity,
  user,
} from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Workflow DPIA (T-075, T-V41): draft→in_progress→pending_approval→approved; approve — только approver. */
const FLOW: Record<string, string[]> = {
  draft: ['in_progress'],
  in_progress: ['pending_approval', 'completed'],
  pending_approval: ['in_progress'],
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
      approverMembershipId?: string;
      reviewDate?: string;
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
          approverMembershipId: input.approverMembershipId ?? null,
          reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
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

  /** T-V41: approver утверждает DPIA (pending_approval → approved). */
  async approve(actor: Actor, id: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          status: privacyAssessment.status,
          approverId: privacyAssessment.approverMembershipId,
        })
        .from(privacyAssessment)
        .where(and(eq(privacyAssessment.id, id), isNull(privacyAssessment.deletedAt)));
      if (!row) throw new NotFoundException(`DPIA ${id} не найдена`);
      if (row.status !== 'pending_approval') {
        throw new BadRequestException('Утвердить можно только DPIA в статусе pending_approval');
      }
      const [me] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
      if (!row.approverId || row.approverId !== me?.id) {
        throw new ForbiddenException('Утвердить может только назначенный approver');
      }
      await tx
        .update(privacyAssessment)
        .set({ status: 'approved', approvedAt: sql`now()` })
        .where(eq(privacyAssessment.id, id));
      return { before: row.status };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'privacy_assessment.approved',
      entityType: 'privacy_assessment',
      entityId: id,
      before: { status: result.before },
      after: { status: 'approved' },
    });
    return { id, status: 'approved' };
  }

  async list(tenantId: string, opts?: { userId?: string; needsMyApproval?: boolean }) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      let myMembershipId: string | null = null;
      if (opts?.needsMyApproval && opts.userId) {
        const [me] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(and(eq(membership.userId, opts.userId), eq(membership.tenantId, tenantId)));
        myMembershipId = me?.id ?? '__none__';
      }
      const conds = [isNull(privacyAssessment.deletedAt)];
      if (opts?.needsMyApproval) {
        conds.push(eq(privacyAssessment.status, 'pending_approval'));
        conds.push(eq(privacyAssessment.approverMembershipId, myMembershipId ?? '__none__'));
      }
      const rows = await tx
        .select({
          id: privacyAssessment.id,
          title: privacyAssessment.title,
          riskLevel: privacyAssessment.riskLevel,
          status: privacyAssessment.status,
          processingActivityId: privacyAssessment.processingActivityId,
          approverMembershipId: privacyAssessment.approverMembershipId,
          approver: user.fullName,
          reviewDate: privacyAssessment.reviewDate,
        })
        .from(privacyAssessment)
        .leftJoin(membership, eq(privacyAssessment.approverMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(...conds))
        .orderBy(desc(privacyAssessment.createdAt));
      return rows.map((a) => ({
        id: a.id,
        title: a.title,
        riskLevel: a.riskLevel,
        status: a.status,
        processingActivityId: a.processingActivityId,
        approverMembershipId: a.approverMembershipId,
        approver: a.approver ?? null,
        reviewDate: a.reviewDate?.toISOString() ?? null,
      }));
    });
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
