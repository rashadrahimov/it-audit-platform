import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditFirm, evidenceReview, membership, user } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Сущности, для которых аудитор ревьюит evidence (T-V29). */
const EVIDENCE_ENTITIES = new Set(['response', 'document', 'vendor_assessment', 'control']);
const REVIEW_STATUSES = ['not_ready', 'ready', 'flagged', 'accepted'];

/** Audit firm + evidence tracker (T-V29): реестр фирм и статусы ревью доказательств. */
@Injectable()
export class AuditFirmsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // === Audit firms ===

  async listFirms(tenantId: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: auditFirm.id,
          name: auditFirm.name,
          contactEmail: auditFirm.contactEmail,
          note: auditFirm.note,
        })
        .from(auditFirm)
        .where(isNull(auditFirm.deletedAt))
        .orderBy(asc(auditFirm.name)),
    );
  }

  async createFirm(actor: Actor, input: { name: string; contactEmail?: string; note?: string }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(auditFirm)
        .values({
          tenantId: actor.tenantId,
          name: input.name,
          contactEmail: input.contactEmail ?? null,
          note: input.note ?? null,
        })
        .returning();
      return row!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'audit_firm.created',
      entityType: 'audit_firm',
      entityId: created.id,
      after: { name: created.name },
    });
    return { id: created.id };
  }

  async deleteFirm(actor: Actor, id: string) {
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: auditFirm.id })
        .from(auditFirm)
        .where(and(eq(auditFirm.id, id), isNull(auditFirm.deletedAt)));
      if (!row) throw new NotFoundException(`Фирма ${id} не найдена`);
      await tx.update(auditFirm).set({ deletedAt: new Date() }).where(eq(auditFirm.id, id));
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'audit_firm.deleted',
      entityType: 'audit_firm',
      entityId: id,
    });
    return { deleted: true };
  }

  // === Evidence tracker ===

  /** Статусы ревью пачки сущностей — {entityId → {status, note, reviewer, reviewedAt}}. */
  async reviewsFor(tenantId: string, entityType: string, entityIds: string[]) {
    if (!EVIDENCE_ENTITIES.has(entityType)) {
      throw new BadRequestException(`entityType: ожидается ${[...EVIDENCE_ENTITIES].join('|')}`);
    }
    if (entityIds.length === 0) return {};
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          entityId: evidenceReview.entityId,
          status: evidenceReview.status,
          note: evidenceReview.note,
          reviewedAt: evidenceReview.reviewedAt,
          reviewer: user.fullName,
        })
        .from(evidenceReview)
        .leftJoin(membership, eq(evidenceReview.reviewedByMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(
          and(
            eq(evidenceReview.entityType, entityType),
            inArray(evidenceReview.entityId, entityIds),
          ),
        ),
    );
    const out: Record<
      string,
      { status: string; note: string | null; reviewer: string | null; reviewedAt: string | null }
    > = {};
    for (const r of rows) {
      out[r.entityId] = {
        status: r.status,
        note: r.note,
        reviewer: r.reviewer,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      };
    }
    return out;
  }

  /** Установить статус ревью (upsert по entity). reviewer — membership актора. */
  async setReview(
    actor: Actor,
    input: { entityType: string; entityId: string; status: string; note?: string | null },
  ) {
    if (!EVIDENCE_ENTITIES.has(input.entityType)) {
      throw new BadRequestException(`entityType: ожидается ${[...EVIDENCE_ENTITIES].join('|')}`);
    }
    if (!REVIEW_STATUSES.includes(input.status)) {
      throw new BadRequestException(`status: ожидается ${REVIEW_STATUSES.join('|')}`);
    }
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      // membership актора в этом тенанте (reviewer)
      const [m] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
      const reviewerId = m?.id ?? null;
      const [row] = await tx
        .insert(evidenceReview)
        .values({
          tenantId: actor.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          status: input.status,
          note: input.note ?? null,
          reviewedByMembershipId: reviewerId,
          reviewedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [evidenceReview.tenantId, evidenceReview.entityType, evidenceReview.entityId],
          set: {
            status: input.status,
            note: input.note ?? null,
            reviewedByMembershipId: reviewerId,
            reviewedAt: new Date(),
            updatedAt: sql`now()`,
          },
        })
        .returning();
      return row!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'evidence.reviewed',
      entityType: input.entityType,
      entityId: input.entityId,
      after: { status: input.status },
    });
    return { id: result.id, status: result.status };
  }

  /** T-V29: сводка Auditor Assessment по engagement — статусы evidence его WP/responses. */
  async assessment(tenantId: string, entityType: string, entityIds: string[]) {
    const reviews = await this.reviewsFor(tenantId, entityType, entityIds);
    const counts = { not_ready: 0, ready: 0, flagged: 0, accepted: 0, unreviewed: 0 };
    for (const id of entityIds) {
      const r = reviews[id];
      if (!r) counts.unreviewed += 1;
      else counts[r.status as keyof typeof counts] += 1;
    }
    return { total: entityIds.length, counts };
  }

  async listReviews(tenantId: string, entityType: string, entityId: string) {
    const map = await this.reviewsFor(tenantId, entityType, [entityId]);
    return map[entityId] ?? { status: 'not_ready', note: null, reviewer: null, reviewedAt: null };
  }
}
