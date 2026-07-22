import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { DEFAULT_LOCALE, resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { finding, membership, task, user } from '../db/schema';
import { localizedRecommendationTemplates } from '../seed-data/recommendation-templates';
import {
  ACTION_PLAN_DUE_DAYS,
  acceptedAiControlClause,
  actionPlanTaskProvenance,
  legacyRecommendationTaskTitle,
  recommendationTaskTitle,
  suggestedDueDateForRisk,
} from './action-plan-seed';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Полиморфные сущности, к которым крепятся задачи (T-V27; personnel — T-V26). */
const TASKABLE = new Set([
  'engagement',
  'finding',
  'risk',
  'control',
  'vendor',
  'policy',
  'personnel',
]);

export interface CreateTaskInput {
  entityType: string;
  entityId: string;
  title: string;
  assigneeMembershipId?: string;
  dueDate?: string;
}

export interface ActionPlanSeedResult {
  created: number;
  skipped: number;
  suggestedDueDates: number;
  withOwner: number;
  withControlClause: number;
  timelinePolicy: typeof ACTION_PLAN_DUE_DAYS;
}

/** Задачи ремедиации (T-V27): декомпозиция finding/risk на шаги с due/assignee. */
@Injectable()
export class TasksService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(
    tenantId: string,
    entityType: string,
    entityId: string,
    locale: Locale = DEFAULT_LOCALE,
  ) {
    if (!TASKABLE.has(entityType)) {
      throw new BadRequestException(`entityType: ожидается ${[...TASKABLE].join('|')}`);
    }
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: task.id,
          title: task.title,
          status: task.status,
          assigneeMembershipId: task.assigneeMembershipId,
          assignee: user.fullName,
          dueDate: task.dueDate,
          completedAt: task.completedAt,
        })
        .from(task)
        .leftJoin(membership, eq(task.assigneeMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(eq(task.entityType, entityType), eq(task.entityId, entityId)))
        .orderBy(asc(task.createdAt));
      if (entityType !== 'finding' || rows.length === 0) return { rows, findingRow: null };
      const [findingRow] = await tx
        .select({
          id: finding.id,
          recommendationI18n: finding.recommendationI18n,
          riskRating: finding.riskRating,
          ownerMembershipId: finding.ownerMembershipId,
          dueDate: finding.dueDate,
          custom: finding.custom,
        })
        .from(finding)
        .where(and(eq(finding.id, entityId), isNull(finding.deletedAt)));
      return { rows, findingRow: findingRow ?? null };
    });
    const recommendation = data.findingRow?.recommendationI18n
      ? resolveLocalized(data.findingRow.recommendationI18n, locale).trim()
      : '';
    const controlClause = data.findingRow ? acceptedAiControlClause(data.findingRow.custom) : null;
    return data.rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      assigneeMembershipId: r.assigneeMembershipId,
      assignee: r.assignee,
      dueDate: r.dueDate?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      provenance:
        data.findingRow && recommendation
          ? actionPlanTaskProvenance({
              taskTitle: r.title,
              findingId: data.findingRow.id,
              recommendation,
              riskRating: data.findingRow.riskRating,
              findingDueDate: data.findingRow.dueDate,
              findingOwnerMembershipId: data.findingRow.ownerMembershipId,
              taskAssigneeMembershipId: r.assigneeMembershipId,
              controlClause,
            })
          : null,
    }));
  }

  recommendationTemplates(locale: Locale) {
    const templates = localizedRecommendationTemplates(locale);
    return {
      count: templates.length,
      templates,
      actionPlanPolicy: ACTION_PLAN_DUE_DAYS,
      reusable: true,
      humanReviewRequired: true,
    };
  }

  async create(actor: Actor, input: CreateTaskInput) {
    if (!TASKABLE.has(input.entityType)) {
      throw new BadRequestException(`entityType: ожидается ${[...TASKABLE].join('|')}`);
    }
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      if (input.assigneeMembershipId) {
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.id, input.assigneeMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!m) throw new BadRequestException('assignee: участник не найден в тенанте');
      }
      const [row] = await tx
        .insert(task)
        .values({
          tenantId: actor.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          assigneeMembershipId: input.assigneeMembershipId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        })
        .returning();
      if (!row) throw new Error('Задача не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'task.created',
      entityType: input.entityType,
      entityId: input.entityId,
      after: { title: created.title, taskId: created.id },
    });
    return { id: created.id, status: created.status };
  }

  /**
   * T-H35/T-H68: recommendations → Action Plan. Создаёт remediation tasks из рекомендаций
   * findings выбранного engagement, сохраняя owner, добавляя risk-based dueDate fallback,
   * control/standard clause из accepted AI review и не дублируя уже созданные.
   */
  async seedActionPlanFromFindings(
    actor: Actor,
    input: { engagementId: string; locale: Locale },
  ): Promise<ActionPlanSeedResult> {
    const seedDate = new Date();
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: finding.id,
          titleI18n: finding.titleI18n,
          recommendationI18n: finding.recommendationI18n,
          riskRating: finding.riskRating,
          ownerMembershipId: finding.ownerMembershipId,
          dueDate: finding.dueDate,
          custom: finding.custom,
        })
        .from(finding)
        .where(and(eq(finding.engagementId, input.engagementId), isNull(finding.deletedAt)));
      const eligible = rows
        .map((f) => {
          const recommendation = f.recommendationI18n
            ? resolveLocalized(f.recommendationI18n, input.locale).trim()
            : '';
          if (!recommendation) return null;
          const findingTitle = resolveLocalized(f.titleI18n, input.locale);
          const controlClause = acceptedAiControlClause(f.custom);
          const legacyTitle = legacyRecommendationTaskTitle(recommendation);
          const dueDate = f.dueDate ?? suggestedDueDateForRisk(f.riskRating, seedDate);
          return {
            findingId: f.id,
            title: recommendationTaskTitle({ recommendation, controlClause }),
            legacyTitle,
            findingTitle,
            riskRating: f.riskRating,
            controlClause,
            ownerMembershipId: f.ownerMembershipId,
            dueDate,
            hadExplicitDueDate: Boolean(f.dueDate),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      if (eligible.length === 0) {
        return {
          created: 0,
          skipped: 0,
          suggestedDueDates: 0,
          withOwner: 0,
          withControlClause: 0,
          timelinePolicy: ACTION_PLAN_DUE_DAYS,
        };
      }

      const existing = await tx
        .select({ entityId: task.entityId, title: task.title })
        .from(task)
        .where(
          and(
            eq(task.entityType, 'finding'),
            inArray(
              task.entityId,
              eligible.map((f) => f.findingId),
            ),
          ),
        );
      const existingKeys = new Set(existing.map((t) => `${t.entityId}:${t.title}`));
      const toCreate = eligible.filter(
        (f) =>
          !existingKeys.has(`${f.findingId}:${f.title}`) &&
          !existingKeys.has(`${f.findingId}:${f.legacyTitle}`),
      );
      if (toCreate.length > 0) {
        await tx.insert(task).values(
          toCreate.map((f) => ({
            tenantId: actor.tenantId,
            entityType: 'finding',
            entityId: f.findingId,
            title: f.title,
            assigneeMembershipId: f.ownerMembershipId ?? null,
            dueDate: f.dueDate,
          })),
        );
      }
      return {
        created: toCreate.length,
        skipped: eligible.length - toCreate.length,
        suggestedDueDates: eligible.filter((f) => !f.hadExplicitDueDate).length,
        withOwner: eligible.filter((f) => Boolean(f.ownerMembershipId)).length,
        withControlClause: eligible.filter((f) => Boolean(f.controlClause)).length,
        timelinePolicy: ACTION_PLAN_DUE_DAYS,
      };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'action_plan.seeded',
      entityType: 'engagement',
      entityId: input.engagementId,
      after: result,
    });
    return result;
  }

  /** Смена статуса/полей задачи; done проставляет completed_at. */
  async update(
    actor: Actor,
    id: string,
    input: { status?: string; assigneeMembershipId?: string | null; dueDate?: string | null },
  ) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx.select().from(task).where(eq(task.id, id));
      if (!row) throw new NotFoundException(`Задача ${id} не найдена`);
      if (input.assigneeMembershipId) {
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.id, input.assigneeMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!m) throw new BadRequestException('assignee: участник не найден в тенанте');
      }
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) {
        patch.status = input.status;
        patch.completedAt = input.status === 'done' ? new Date() : null;
      }
      if (input.assigneeMembershipId !== undefined) {
        patch.assigneeMembershipId = input.assigneeMembershipId;
      }
      if (input.dueDate !== undefined) {
        patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      }
      const [res] = await tx.update(task).set(patch).where(eq(task.id, id)).returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'task.updated',
      entityType: updated.entityType,
      entityId: updated.entityId,
      after: { taskId: id, status: updated.status },
    });
    return { id: updated.id, status: updated.status };
  }

  /**
   * T-V26: массово создать задачи-чеклист для сущности (on/offboarding).
   * Внутри уже открытой транзакции тенанта — вызывается из PersonnelService.
   */
  async seedForEntity(
    tx: Parameters<Parameters<DbService['withTenant']>[1]>[0],
    tenantId: string,
    entityType: string,
    entityId: string,
    titles: string[],
    dueDate?: Date | null,
  ) {
    if (titles.length === 0) return 0;
    await tx.insert(task).values(
      titles.map((title) => ({
        tenantId,
        entityType,
        entityId,
        title,
        dueDate: dueDate ?? null,
      })),
    );
    return titles.length;
  }

  /** T-V26: сводка задач сущности — open/overdue/total (для «Task status»). */
  summarize(rows: Array<{ status: string; dueDate: Date | null }>, now: Date) {
    const total = rows.length;
    const open = rows.filter((r) => r.status !== 'done').length;
    const overdue = rows.filter(
      (r) => r.status !== 'done' && r.dueDate !== null && r.dueDate < now,
    ).length;
    return { total, open, overdue };
  }

  async remove(actor: Actor, id: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx.select().from(task).where(eq(task.id, id));
      if (!row) throw new NotFoundException(`Задача ${id} не найдена`);
      await tx.delete(task).where(eq(task.id, id));
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'task.deleted',
      entityType: removed.entityType,
      entityId: removed.entityId,
      before: { taskId: id, title: removed.title },
    });
    return { deleted: true };
  }
}
