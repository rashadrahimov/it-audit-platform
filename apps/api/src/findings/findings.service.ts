import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  localeSchema,
  resolveLocalized,
  type I18nText,
  type Locale,
  type RiskRating,
} from '@it-audit/shared';
import { alias } from 'drizzle-orm/pg-core';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { RbacService } from '../rbac/rbac.service';
import { maskFields, rejectedWriteFields } from '../rbac/field-policy';
import {
  auditLog,
  checklistItem,
  comment,
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

/**
 * Lifecycle (T-039, data-model §8): identified → assigned → in_progress →
 * remediated → pending_retest → closed; overdue — вычисляемый флаг SLA, не состояние.
 */
const FINDING_FLOW = [
  'identified',
  'assigned',
  'in_progress',
  'remediated',
  'pending_retest',
  'closed',
] as const;
const flowIndex = (s: string): number => FINDING_FLOW.indexOf(s as (typeof FINDING_FLOW)[number]);

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
    private readonly emailService: EmailService,
    private readonly rbacService: RbacService,
  ) {}

  /**
   * SEC-04 (ADR-0020): запрет записи ограниченных полей. Ключи I18n нормализуем к
   * domain-имени (recommendationI18n→recommendation), как в field_permission.
   */
  private async assertFieldWriteAllowed(
    actor: Actor,
    input: Record<string, unknown>,
    entityType: string,
  ): Promise<void> {
    const levels = await this.rbacService.fieldLevels(actor.userId, actor.tenantId, entityType);
    if (Object.keys(levels).length === 0) return;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      normalized[k.replace(/I18n$/, '')] = v;
    }
    const rejected = rejectedWriteFields(normalized, levels);
    if (rejected.length > 0) {
      throw new ForbiddenException(`Нет права на запись полей: ${rejected.join(', ')}`);
    }
  }

  async create(actor: Actor, input: CreateFindingInput) {
    await this.assertFieldWriteAllowed(
      actor,
      input as unknown as Record<string, unknown>,
      'finding',
    );
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

  /** Назначение owner'а (T-039): identified/assigned → assigned + письмо владельцу. */
  async assign(actor: Actor, id: string, ownerMembershipId: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(finding)
        .where(and(eq(finding.id, id), isNull(finding.deletedAt)));
      if (!row) throw new NotFoundException(`Finding ${id} не найден`);
      if (!['identified', 'assigned'].includes(row.status)) {
        throw new BadRequestException(`Назначение из статуса ${row.status} недоступно`);
      }
      const [updated] = await tx
        .update(finding)
        .set({ ownerMembershipId, status: 'assigned' })
        .where(eq(finding.id, id))
        .returning();
      return { row, updated };
    });
    // owner над-тенантный: membership→user вне RLS
    const [owner] = await this.dbService.db
      .select({ email: user.email, locale: user.locale, fullName: user.fullName })
      .from(membership)
      .innerJoin(user, eq(membership.userId, user.id))
      .where(and(eq(membership.id, ownerMembershipId), eq(membership.tenantId, actor.tenantId)));
    if (!owner) throw new BadRequestException('ownerMembershipId: membership не найден в тенанте');
    const parsedLocale = localeSchema.safeParse(owner.locale);
    await this.emailService.sendTemplate(
      'finding-assigned',
      parsedLocale.success ? parsedLocale.data : 'en',
      owner.email,
      {
        findingTitle: result.row.titleI18n.en,
        dueDate: result.row.dueDate?.toISOString().slice(0, 10) ?? '',
      },
    );
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'finding.assigned',
      entityType: 'finding',
      entityId: id,
      after: { owner: owner.email },
    });
    return result.updated;
  }

  /**
   * Переход по цепочке (строго следующий шаг). Закрытие через transition —
   * только вне формального режима (formal закрывается retest'ом, диаграмма RFP).
   */
  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(finding)
        .where(and(eq(finding.id, id), isNull(finding.deletedAt)));
      if (!row) throw new NotFoundException(`Finding ${id} не найден`);
      const fromIdx = flowIndex(row.status);
      const toIdx = flowIndex(to);
      if (fromIdx < 0 || toIdx < 0 || toIdx !== fromIdx + 1) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      if (to === 'closed') {
        let mode = 'light';
        if (row.engagementId) {
          const [eng] = await tx
            .select({ mode: engagement.mode })
            .from(engagement)
            .where(eq(engagement.id, row.engagementId));
          mode = eng?.mode ?? 'light';
        }
        if (mode === 'formal') {
          throw new BadRequestException(
            'В формальном режиме закрытие — только через re-test аудитора',
          );
        }
      }
      const [updated] = await tx
        .update(finding)
        .set({
          status: to,
          remediatedAt: to === 'remediated' ? sql`now()` : row.remediatedAt,
          resolutionDate: to === 'closed' ? sql`now()` : row.resolutionDate,
        })
        .where(eq(finding.id, id))
        .returning();
      return { before: row.status, updated };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'finding.status_changed',
      entityType: 'finding',
      entityId: id,
      before: { status: result.before },
      after: { status: to },
    });
    return result.updated;
  }

  /** Re-test аудитором (T-039): passed → closed, failed → назад в in_progress. */
  async retest(actor: Actor, id: string, resultValue: 'passed' | 'failed') {
    const [auditorMembership] = await this.dbService.db
      .select()
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(finding)
        .where(and(eq(finding.id, id), isNull(finding.deletedAt)));
      if (!row) throw new NotFoundException(`Finding ${id} не найден`);
      if (row.status !== 'pending_retest') {
        throw new BadRequestException(
          `Re-test доступен только из pending_retest (сейчас ${row.status})`,
        );
      }
      const [updated] = await tx
        .update(finding)
        .set({
          status: resultValue === 'passed' ? 'closed' : 'in_progress',
          retestResult: resultValue,
          retestedBy: auditorMembership?.id ?? null,
          resolutionDate: resultValue === 'passed' ? sql`now()` : row.resolutionDate,
        })
        .where(eq(finding.id, id))
        .returning();
      return { before: row.status, updated };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'finding.retested',
      entityType: 'finding',
      entityId: id,
      before: { status: result.before },
      after: { status: result.updated?.status, retestResult: resultValue },
    });
    return result.updated;
  }

  async list(
    tenantId: string,
    locale: Locale,
    engagementId?: string,
    filters?: {
      status?: string;
      riskRating?: string;
      slaStatus?: string;
      ownerMembershipId?: string;
    },
  ) {
    const ownerMembership = alias(membership, 'owner_membership');
    const ownerUser = alias(user, 'owner_user');
    const auditorMembership = alias(membership, 'auditor_membership');
    const auditorUser = alias(user, 'auditor_user');
    const conds = [isNull(finding.deletedAt)];
    if (engagementId) conds.push(eq(finding.engagementId, engagementId));
    if (filters?.status) conds.push(eq(finding.status, filters.status));
    if (filters?.riskRating) conds.push(eq(finding.riskRating, filters.riskRating));
    if (filters?.slaStatus) conds.push(eq(finding.slaStatus, filters.slaStatus));
    if (filters?.ownerMembershipId) {
      conds.push(eq(finding.ownerMembershipId, filters.ownerMembershipId));
    }
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
        .where(and(...conds))
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

  async detail(tenantId: string, userId: string, id: string, locale: Locale) {
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(finding)
        .where(and(eq(finding.id, id), isNull(finding.deletedAt)));
      if (!row) return null;
      // T-V03: карточка одним ответом (паттерн T-032) — имена сторон, история, комментарии
      const names = new Map<string, string>();
      for (const mid of [row.ownerMembershipId, row.auditorMembershipId]) {
        if (!mid) continue;
        const [m] = await tx
          .select({ fullName: user.fullName })
          .from(membership)
          .innerJoin(user, eq(membership.userId, user.id))
          .where(eq(membership.id, mid));
        if (m) names.set(mid, m.fullName);
      }
      const history = await tx
        .select({ action: auditLog.action, at: auditLog.at, actor: user.fullName })
        .from(auditLog)
        .leftJoin(user, eq(auditLog.actorUserId, user.id))
        .where(and(eq(auditLog.entityType, 'finding'), eq(auditLog.entityId, id)))
        .orderBy(desc(auditLog.at));
      const comments = await tx
        .select({ body: comment.body, at: comment.createdAt, author: user.fullName })
        .from(comment)
        .innerJoin(user, eq(comment.authorUserId, user.id))
        .where(
          and(
            eq(comment.entityType, 'finding'),
            eq(comment.entityId, id),
            isNull(comment.deletedAt),
          ),
        )
        .orderBy(desc(comment.createdAt));
      return { row, names, history, comments };
    });
    if (!data) throw new NotFoundException(`Finding ${id} не найден`);
    const { row, names, history, comments } = data;
    const nextIdx = flowIndex(row.status);
    const dto = {
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
      owner: row.ownerMembershipId ? (names.get(row.ownerMembershipId) ?? null) : null,
      auditor: row.auditorMembershipId ? (names.get(row.auditorMembershipId) ?? null) : null,
      managementResponse: row.managementResponse,
      remediatedAt: row.remediatedAt?.toISOString() ?? null,
      retestResult: row.retestResult,
      resolutionDate: row.resolutionDate?.toISOString() ?? null,
      // T-V03: следующий шаг lifecycle для кнопок UI (сервер всё равно enforce'ит)
      allowedNext: nextIdx >= 0 ? (FINDING_FLOW[nextIdx + 1] ?? null) : null,
      history: history.map((h) => ({ action: h.action, actor: h.actor, at: h.at.toISOString() })),
      comments: comments.map((c) => ({ author: c.author, body: c.body, at: c.at.toISOString() })),
    };
    // SEC-04 (ADR-0020): field-level маскирование по роли (эталон: recommendation)
    const levels = await this.rbacService.fieldLevels(userId, tenantId, 'finding');
    return maskFields(dto, levels);
  }
}
