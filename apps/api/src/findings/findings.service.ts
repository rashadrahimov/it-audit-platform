import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale, type RiskRating } from '@it-audit/shared';
import { alias } from 'drizzle-orm/pg-core';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  checklistItem,
  control,
  engagement,
  finding,
  membership,
  response,
  user,
} from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface CreateFindingInput {
  engagementId?: string;
  checklistItemId?: string;
  responseId?: string;
  controlId?: string;
  titleI18n: I18nText;
  descriptionI18n?: I18nText;
  riskRating: RiskRating;
  recommendationI18n?: I18nText;
  ownerMembershipId?: string;
  auditorMembershipId?: string;
  dueDate?: string;
  managementResponse?: string;
}

/** Finding (T-038): «третья колонка» чеклиста клиента; lifecycle придёт с T-039. */
@Injectable()
export class FindingsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: CreateFindingInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      // все привязки опциональны (standalone), но заданные должны существовать
      if (input.engagementId) {
        const [row] = await tx
          .select({ id: engagement.id })
          .from(engagement)
          .where(and(eq(engagement.id, input.engagementId), isNull(engagement.deletedAt)));
        if (!row) throw new BadRequestException('engagementId не найден');
      }
      if (input.checklistItemId) {
        const [row] = await tx
          .select({ id: checklistItem.id })
          .from(checklistItem)
          .where(eq(checklistItem.id, input.checklistItemId));
        if (!row) throw new BadRequestException('checklistItemId не найден');
      }
      if (input.responseId) {
        const [row] = await tx
          .select({ id: response.id })
          .from(response)
          .where(eq(response.id, input.responseId));
        if (!row) throw new BadRequestException('responseId не найден');
      }
      if (input.controlId) {
        const [row] = await tx
          .select({ id: control.id })
          .from(control)
          .where(and(eq(control.id, input.controlId), isNull(control.deletedAt)));
        if (!row) throw new BadRequestException('controlId не найден');
      }
      for (const [field, membershipId] of [
        ['ownerMembershipId', input.ownerMembershipId],
        ['auditorMembershipId', input.auditorMembershipId],
      ] as const) {
        if (!membershipId) continue;
        const [row] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(and(eq(membership.id, membershipId), eq(membership.tenantId, actor.tenantId)));
        if (!row) throw new BadRequestException(`${field}: membership не найден в тенанте`);
      }

      const [row] = await tx
        .insert(finding)
        .values({
          tenantId: actor.tenantId,
          engagementId: input.engagementId ?? null,
          checklistItemId: input.checklistItemId ?? null,
          responseId: input.responseId ?? null,
          controlId: input.controlId ?? null,
          titleI18n: input.titleI18n,
          descriptionI18n: input.descriptionI18n ?? null,
          riskRating: input.riskRating,
          recommendationI18n: input.recommendationI18n ?? null,
          ownerMembershipId: input.ownerMembershipId ?? null,
          auditorMembershipId: input.auditorMembershipId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          managementResponse: input.managementResponse ?? null,
        })
        .returning();
      if (!row) throw new Error('Finding не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'finding.created',
      entityType: 'finding',
      entityId: created.id,
      after: { title: created.titleI18n.en, riskRating: created.riskRating },
    });
    return created;
  }

  async list(tenantId: string, locale: Locale, engagementId?: string) {
    const ownerMembership = alias(membership, 'owner_membership');
    const ownerUser = alias(user, 'owner_user');
    const auditorMembership = alias(membership, 'auditor_membership');
    const auditorUser = alias(user, 'auditor_user');
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: finding.id,
          titleI18n: finding.titleI18n,
          riskRating: finding.riskRating,
          status: finding.status,
          slaStatus: finding.slaStatus,
          dueDate: finding.dueDate,
          engagementId: finding.engagementId,
          controlId: finding.controlId,
          owner: ownerUser.fullName,
          auditor: auditorUser.fullName,
        })
        .from(finding)
        .leftJoin(ownerMembership, eq(finding.ownerMembershipId, ownerMembership.id))
        .leftJoin(ownerUser, eq(ownerMembership.userId, ownerUser.id))
        .leftJoin(auditorMembership, eq(finding.auditorMembershipId, auditorMembership.id))
        .leftJoin(auditorUser, eq(auditorMembership.userId, auditorUser.id))
        .where(
          engagementId
            ? and(isNull(finding.deletedAt), eq(finding.engagementId, engagementId))
            : isNull(finding.deletedAt),
        )
        .orderBy(desc(finding.createdAt)),
    );
    return rows.map((row) => ({
      id: row.id,
      title: resolveLocalized(row.titleI18n, locale),
      riskRating: row.riskRating,
      status: row.status,
      slaStatus: row.slaStatus,
      dueDate: row.dueDate?.toISOString() ?? null,
      engagementId: row.engagementId,
      controlId: row.controlId,
      owner: row.owner,
      auditor: row.auditor,
    }));
  }

  async detail(tenantId: string, id: string, locale: Locale) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(finding)
        .where(and(eq(finding.id, id), isNull(finding.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Finding ${id} не найден`);
    return {
      id: row.id,
      title: resolveLocalized(row.titleI18n, locale),
      description: row.descriptionI18n ? resolveLocalized(row.descriptionI18n, locale) : null,
      recommendation: row.recommendationI18n
        ? resolveLocalized(row.recommendationI18n, locale)
        : null,
      riskRating: row.riskRating,
      status: row.status,
      slaStatus: row.slaStatus,
      dueDate: row.dueDate?.toISOString() ?? null,
      engagementId: row.engagementId,
      checklistItemId: row.checklistItemId,
      responseId: row.responseId,
      controlId: row.controlId,
      ownerMembershipId: row.ownerMembershipId,
      auditorMembershipId: row.auditorMembershipId,
      managementResponse: row.managementResponse,
      remediatedAt: row.remediatedAt?.toISOString() ?? null,
      retestResult: row.retestResult,
      resolutionDate: row.resolutionDate?.toISOString() ?? null,
    };
  }
}
