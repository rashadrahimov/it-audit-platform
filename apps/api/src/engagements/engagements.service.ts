import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditType, engagement, engagementMilestone, subsidiary } from '../db/schema';
import {
  allowedTransitions,
  canTransition,
  ENGAGEMENT_FLOW,
  type EngagementMode,
} from './engagement-states';

export interface CreateEngagementInput {
  subsidiaryId: string;
  titleI18n: I18nText;
  auditTypeCode?: string;
  mode: EngagementMode;
  periodStart?: string;
  periodEnd?: string;
  milestones: Array<{ stage: string; plannedDate: string }>;
}

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Engagement (T-035, ADR-0005): CRUD + переходы state machine с фиксацией вех. */
@Injectable()
export class EngagementsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: CreateEngagementInput) {
    for (const m of input.milestones) {
      if (!ENGAGEMENT_FLOW.includes(m.stage as (typeof ENGAGEMENT_FLOW)[number])) {
        throw new BadRequestException(`Веха: неизвестная стадия «${m.stage}»`);
      }
    }
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [sub] = await tx
        .select()
        .from(subsidiary)
        .where(and(eq(subsidiary.id, input.subsidiaryId), isNull(subsidiary.deletedAt)));
      if (!sub) throw new BadRequestException(`Дочка ${input.subsidiaryId} не найдена`);

      let auditTypeId: string | null = null;
      if (input.auditTypeCode) {
        const [type] = await tx
          .select()
          .from(auditType)
          .where(eq(auditType.code, input.auditTypeCode));
        if (!type) throw new BadRequestException(`Тип аудита «${input.auditTypeCode}» не найден`);
        auditTypeId = type.id;
      }

      const [row] = await tx
        .insert(engagement)
        .values({
          tenantId: actor.tenantId,
          subsidiaryId: input.subsidiaryId,
          auditTypeId,
          titleI18n: input.titleI18n,
          mode: input.mode,
          periodStart: input.periodStart ? new Date(input.periodStart) : null,
          periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
        })
        .returning();
      if (!row) throw new Error('Engagement не создался');
      if (input.milestones.length > 0) {
        await tx.insert(engagementMilestone).values(
          input.milestones.map((m) => ({
            engagementId: row.id,
            stage: m.stage,
            plannedDate: new Date(m.plannedDate),
          })),
        );
      }
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'engagement.created',
      entityType: 'engagement',
      entityId: created.id,
      after: { title: created.titleI18n.en, mode: created.mode, state: created.state },
    });
    return created;
  }

  /** Переход state machine; вход в стадию проставляет actual_date её вехи (ENG-03). */
  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, id), isNull(engagement.deletedAt)));
      if (!row) throw new NotFoundException(`Engagement ${id} не найден`);
      if (!canTransition(row.mode as EngagementMode, row.state, to, row.pausedFromState)) {
        throw new BadRequestException(
          `Переход ${row.state} → ${to} недопустим в режиме ${row.mode}`,
        );
      }
      const [updated] = await tx
        .update(engagement)
        .set({
          state: to,
          pausedFromState: to === 'paused' ? row.state : null,
          archivedAt: to === 'archived' ? sql`now()` : row.archivedAt,
        })
        .where(eq(engagement.id, id))
        .returning();
      // веха стадии: есть — фиксируем факт; нет — создаём фактическую (план не задавался)
      if (ENGAGEMENT_FLOW.includes(to as (typeof ENGAGEMENT_FLOW)[number])) {
        const [milestone] = await tx
          .select()
          .from(engagementMilestone)
          .where(and(eq(engagementMilestone.engagementId, id), eq(engagementMilestone.stage, to)));
        if (milestone) {
          await tx
            .update(engagementMilestone)
            .set({ actualDate: sql`now()` })
            .where(eq(engagementMilestone.id, milestone.id));
        } else {
          await tx
            .insert(engagementMilestone)
            .values({ engagementId: id, stage: to, actualDate: new Date() });
        }
      }
      return { before: row.state, row: updated };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'engagement.state_changed',
      entityType: 'engagement',
      entityId: id,
      before: { state: result.before },
      after: { state: to },
    });
    return result.row;
  }

  async list(tenantId: string, locale: Locale) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: engagement.id,
          titleI18n: engagement.titleI18n,
          mode: engagement.mode,
          state: engagement.state,
          subsidiaryName: subsidiary.nameI18n,
          auditTypeName: auditType.nameI18n,
          createdAt: engagement.createdAt,
        })
        .from(engagement)
        .innerJoin(subsidiary, eq(engagement.subsidiaryId, subsidiary.id))
        .leftJoin(auditType, eq(engagement.auditTypeId, auditType.id))
        .where(isNull(engagement.deletedAt))
        .orderBy(asc(engagement.createdAt)),
    );
    return rows.map((row) => ({
      id: row.id,
      title: resolveLocalized(row.titleI18n, locale),
      mode: row.mode,
      state: row.state,
      subsidiary: resolveLocalized(row.subsidiaryName, locale),
      auditType: row.auditTypeName ? resolveLocalized(row.auditTypeName, locale) : null,
    }));
  }

  async detail(tenantId: string, id: string, locale: Locale) {
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, id), isNull(engagement.deletedAt)));
      if (!row) throw new NotFoundException(`Engagement ${id} не найден`);
      const [sub] = await tx.select().from(subsidiary).where(eq(subsidiary.id, row.subsidiaryId));
      const [type] = row.auditTypeId
        ? await tx.select().from(auditType).where(eq(auditType.id, row.auditTypeId))
        : [null];
      const milestones = await tx
        .select()
        .from(engagementMilestone)
        .where(eq(engagementMilestone.engagementId, id));
      return { row, sub, type, milestones };
    });

    const stageOrder = (s: string): number => {
      const i = ENGAGEMENT_FLOW.indexOf(s as (typeof ENGAGEMENT_FLOW)[number]);
      return i < 0 ? ENGAGEMENT_FLOW.length : i;
    };
    return {
      id: data.row.id,
      title: resolveLocalized(data.row.titleI18n, locale),
      subsidiary: data.sub ? resolveLocalized(data.sub.nameI18n, locale) : null,
      auditType: data.type ? resolveLocalized(data.type.nameI18n, locale) : null,
      mode: data.row.mode,
      state: data.row.state,
      pausedFromState: data.row.pausedFromState,
      periodStart: data.row.periodStart?.toISOString() ?? null,
      periodEnd: data.row.periodEnd?.toISOString() ?? null,
      archivedAt: data.row.archivedAt?.toISOString() ?? null,
      allowedTransitions: allowedTransitions(
        data.row.mode as EngagementMode,
        data.row.state,
        data.row.pausedFromState,
      ),
      milestones: data.milestones
        .sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage))
        .map((m) => ({
          stage: m.stage,
          plannedDate: m.plannedDate?.toISOString() ?? null,
          actualDate: m.actualDate?.toISOString() ?? null,
        })),
    };
  }
}
