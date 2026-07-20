import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuditorVerdict } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  auditorAssessment,
  checklistItem,
  engagement,
  finding,
  membership,
  user,
} from '../db/schema';
import { resolveActorCategory, resolveAuditorScope } from '../rbac/auditor-scope';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string | null;
}

const TARGET_TYPES = new Set(['checklist_item', 'finding']);

/**
 * Auditor Assessment (T-113): судейский вердикт аудитора по пункту аудита,
 * отдельно от самооценки auditee. Append-only лог раундов (round растёт на цель).
 * Оценку выставляет только аудитор (category auditor/external_auditor); внешний
 * аудитор — лишь по целям своих дочек.
 */
@Injectable()
export class AuditorAssessmentsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: { targetType: string; targetId: string; verdict: AuditorVerdict; note?: string },
  ) {
    const category = await resolveActorCategory(this.dbService, actor.tenantId, actor.userId);
    if (category !== 'auditor' && category !== 'internal' && category !== 'external_auditor') {
      throw new ForbiddenException('Оценку выставляет только аудитор');
    }
    if (!TARGET_TYPES.has(input.targetType)) {
      throw new BadRequestException('targetType: checklist_item | finding');
    }

    const target = await this.targetSubsidiary(actor.tenantId, input.targetType, input.targetId);
    if (!target.found) throw new BadRequestException('Цель оценки не найдена');

    const scope = await resolveAuditorScope(this.dbService, actor.tenantId, actor.userId);
    if (scope !== null && (target.subsidiaryId === null || !scope.includes(target.subsidiaryId))) {
      throw new ForbiddenException('Цель оценки вне вашего scope');
    }

    const assessorMembershipId = await this.membershipId(actor.tenantId, actor.userId);
    if (!assessorMembershipId) throw new ForbiddenException('У актора нет membership в тенанте');

    const row = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [{ max } = { max: 0 }] = await tx
        .select({ max: sql<number>`coalesce(max(${auditorAssessment.round}), 0)` })
        .from(auditorAssessment)
        .where(
          and(
            eq(auditorAssessment.targetType, input.targetType),
            eq(auditorAssessment.targetId, input.targetId),
          ),
        );
      const [created] = await tx
        .insert(auditorAssessment)
        .values({
          tenantId: actor.tenantId,
          targetType: input.targetType,
          targetId: input.targetId,
          assessorMembershipId,
          verdict: input.verdict,
          note: input.note ?? null,
          round: Number(max) + 1,
        })
        .returning();
      return created!;
    });

    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'auditor_assessment.created',
      entityType: 'auditor_assessment',
      entityId: row.id,
      after: {
        targetType: row.targetType,
        targetId: row.targetId,
        verdict: row.verdict,
        round: row.round,
      },
    });
    return { id: row.id, round: row.round, verdict: row.verdict as AuditorVerdict };
  }

  /** История раундов оценок по цели (по возрастанию раунда), с именем аудитора. */
  async listFor(tenantId: string, targetType: string, targetId: string) {
    const assessorUser = alias(user, 'assessor_user');
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: auditorAssessment.id,
          round: auditorAssessment.round,
          verdict: auditorAssessment.verdict,
          note: auditorAssessment.note,
          createdAt: auditorAssessment.createdAt,
          assessor: assessorUser.fullName,
        })
        .from(auditorAssessment)
        .leftJoin(membership, eq(auditorAssessment.assessorMembershipId, membership.id))
        .leftJoin(assessorUser, eq(membership.userId, assessorUser.id))
        .where(
          and(
            eq(auditorAssessment.targetType, targetType),
            eq(auditorAssessment.targetId, targetId),
          ),
        )
        .orderBy(asc(auditorAssessment.round)),
    );
    return rows.map((r) => ({
      id: r.id,
      round: r.round,
      verdict: r.verdict,
      note: r.note,
      assessor: r.assessor,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Последний вердикт по цели (для карточки), либо null. */
  async latest(tenantId: string, targetType: string, targetId: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ verdict: auditorAssessment.verdict, round: auditorAssessment.round })
        .from(auditorAssessment)
        .where(
          and(
            eq(auditorAssessment.targetType, targetType),
            eq(auditorAssessment.targetId, targetId),
          ),
        )
        .orderBy(desc(auditorAssessment.round))
        .limit(1),
    );
    return row ?? null;
  }

  /** Дочка пункта аудита (checklist_item/finding → engagement.subsidiary_id). */
  private async targetSubsidiary(
    tenantId: string,
    targetType: string,
    targetId: string,
  ): Promise<{ found: boolean; subsidiaryId: string | null }> {
    if (targetType === 'checklist_item') {
      const [ci] = await this.dbService.withTenant(tenantId, (tx) =>
        tx
          .select({ s: engagement.subsidiaryId })
          .from(checklistItem)
          .innerJoin(engagement, eq(checklistItem.engagementId, engagement.id))
          .where(eq(checklistItem.id, targetId)),
      );
      return ci ? { found: true, subsidiaryId: ci.s } : { found: false, subsidiaryId: null };
    }
    // finding: engagement_id может быть null (standalone) → subsidiary null
    const [f] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ engagementId: finding.engagementId })
        .from(finding)
        .where(eq(finding.id, targetId)),
    );
    if (!f) return { found: false, subsidiaryId: null };
    if (!f.engagementId) return { found: true, subsidiaryId: null };
    const [eng] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ s: engagement.subsidiaryId })
        .from(engagement)
        .where(eq(engagement.id, f.engagementId!)),
    );
    return { found: true, subsidiaryId: eng?.s ?? null };
  }

  private async membershipId(tenantId: string, userId: string): Promise<string | null> {
    const [m] = await this.dbService.db
      .select({ id: membership.id })
      .from(membership)
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.tenantId, tenantId),
          eq(membership.status, 'active'),
        ),
      );
    return m?.id ?? null;
  }
}
