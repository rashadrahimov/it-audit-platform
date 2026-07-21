import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  engagementRoleSchema,
  resolveLocalized,
  type EngagementRole,
  type I18nText,
  type Locale,
} from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  auditType,
  checklistItem,
  control,
  controlDomain,
  document,
  documentLink,
  engagement,
  engagementMember,
  engagementMilestone,
  finding,
  membership,
  response,
  subsidiary,
  user,
} from '../db/schema';
import type { ComplianceStatus } from '@it-audit/shared';
import { assertSubsidiaryInAuditorScope, resolveAuditorScope } from '../rbac/auditor-scope';
import { suggestFindings } from './finding-suggest';
import {
  allowedTransitions,
  canTransition,
  ENGAGEMENT_FLOW,
  type EngagementMode,
} from './engagement-states';
import { memberTransitionDenial, transitionDenialMessage } from './engagement-stage-permissions';

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

const WORKFLOW_PHASES = [
  { key: 'scoping', states: ['draft', 'manager_review'] },
  { key: 'data_collection', states: ['issued_to_respondents', 'responses_in_progress'] },
  { key: 'assessment', states: ['findings_drafting'] },
  { key: 'findings', states: ['management_response', 'approval'] },
  { key: 'reporting', states: ['report_issued', 'follow_up', 'closed'] },
] as const;

type WorkflowPhaseKey = (typeof WORKFLOW_PHASES)[number]['key'];
type WorkflowBlockerReason =
  'paused' | 'milestone_overdue' | 'no_checklist' | 'awaiting_responses' | 'findings_in_review';

function phaseForState(state: string): WorkflowPhaseKey {
  return (
    WORKFLOW_PHASES.find((p) => (p.states as readonly string[]).includes(state))?.key ?? 'scoping'
  );
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
      // T-116/T-123: постадийные права члена команды. Актор, состоящий в составе
      // engagement, ограничен ролью + stage_permissions при движении state-machine
      // (observer не двигает; sign-off — только lead/approver; явные override поверх).
      // Не-члены с RBAC engagement.edit не ограничиваются (обратная совместимость).
      {
        const [me] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.userId, actor.userId),
              eq(membership.tenantId, actor.tenantId),
              eq(membership.status, 'active'),
            ),
          );
        if (me) {
          const [em] = await tx
            .select({
              role: engagementMember.engagementRole,
              stagePermissions: engagementMember.stagePermissions,
            })
            .from(engagementMember)
            .where(
              and(eq(engagementMember.engagementId, id), eq(engagementMember.membershipId, me.id)),
            );
          if (em) {
            const denial = memberTransitionDenial(
              em.role as EngagementRole,
              em.stagePermissions,
              to,
            );
            if (denial) {
              throw new ForbiddenException(transitionDenialMessage(denial, em.role, to));
            }
          }
        }
      }
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

  /**
   * Чеклист (T-036): добавить контроли из библиотеки как СНАПШОТЫ (data-model §10.1) —
   * текст копируется, правка библиотеки не трогает engagement. Уже добавленные пропускаются.
   */
  async addChecklistItems(actor: Actor, engagementId: string, controlIds: string[]) {
    const added = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);

      const existing = await tx
        .select({ controlId: checklistItem.controlId, order: checklistItem.order })
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, engagementId));
      const alreadyIn = new Set(existing.map((i) => i.controlId).filter(Boolean));
      let nextOrder = existing.reduce((max, i) => Math.max(max, i.order), 0);

      const candidates = controlIds.filter((id) => !alreadyIn.has(id));
      if (candidates.length === 0) return [];
      const controls = await tx
        .select()
        .from(control)
        .where(and(inArray(control.id, candidates), isNull(control.deletedAt)));
      if (controls.length !== candidates.length) {
        throw new BadRequestException('Часть контролей не найдена в библиотеке');
      }
      const domains = await tx.select().from(controlDomain);
      const domainCode = new Map(domains.map((d) => [d.id, d.code]));

      const rows = controls.map((c) => ({
        engagementId,
        controlId: c.id,
        ref: c.ref,
        domainCode: domainCode.get(c.domainId) ?? null,
        objectiveI18n: c.objectiveI18n,
        questionI18n: c.questionI18n,
        order: ++nextOrder,
      }));
      await tx.insert(checklistItem).values(rows);
      return rows.map((r) => r.ref);
    });
    if (added.length > 0) {
      await this.auditLogService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorIp: actor.ip,
        action: 'engagement.checklist_updated',
        entityType: 'engagement',
        entityId: engagementId,
        after: { addedRefs: added },
      });
    }
    return { added: added.length };
  }

  /**
   * Ответ респондента (T-037): upsert — один ответ на пункт, повторный PUT
   * перезаписывает. Пункт получает status=answered. Ограничение «только
   * назначенный respondent» придёт вместе с назначением респондентов.
   */
  async saveResponse(
    actor: Actor,
    engagementId: string,
    itemId: string,
    input: { text: string; complianceStatus: ComplianceStatus },
  ) {
    const [respondent] = await this.dbService.db
      .select()
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
    if (!respondent) throw new BadRequestException('У юзера нет membership в тенанте');

    const saved = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [item] = await tx
        .select()
        .from(checklistItem)
        .where(and(eq(checklistItem.id, itemId), eq(checklistItem.engagementId, engagementId)));
      if (!item) throw new NotFoundException(`Пункт ${itemId} не найден в engagement`);
      const [row] = await tx
        .insert(response)
        .values({
          checklistItemId: itemId,
          respondentMembershipId: respondent.id,
          text: input.text,
          complianceStatus: input.complianceStatus,
        })
        .onConflictDoUpdate({
          target: response.checklistItemId,
          set: {
            text: input.text,
            complianceStatus: input.complianceStatus,
            respondentMembershipId: respondent.id,
            submittedAt: sql`now()`,
          },
        })
        .returning();
      if (!row) throw new Error('Ответ не сохранился');
      await tx
        .update(checklistItem)
        .set({ status: 'answered' })
        .where(eq(checklistItem.id, itemId));
      return { row, ref: item.ref };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'response.submitted',
      entityType: 'response',
      entityId: saved.row.id,
      after: { ref: saved.ref, complianceStatus: input.complianceStatus },
    });
    return saved.row;
  }

  /** ENG-08: активный список исключает архивные (archivedAt); archived=true — только архивные. */
  async list(
    tenantId: string,
    userId: string,
    locale: Locale,
    auditTypeCode?: string,
    archived = false,
    filters?: { state?: string; subsidiaryId?: string; mode?: string },
  ) {
    // T-111: внешний аудитор со scope видит engagement'ы только своих дочек.
    const scope = await resolveAuditorScope(this.dbService, tenantId, userId);
    const rows = await this.dbService.withTenant(tenantId, (tx) => {
      const conds = [
        isNull(engagement.deletedAt),
        archived ? isNotNull(engagement.archivedAt) : isNull(engagement.archivedAt),
      ];
      if (scope !== null) {
        conds.push(scope.length === 0 ? sql`false` : inArray(engagement.subsidiaryId, scope));
      }
      if (auditTypeCode) conds.push(eq(auditType.code, auditTypeCode));
      if (filters?.state) conds.push(eq(engagement.state, filters.state));
      if (filters?.mode) conds.push(eq(engagement.mode, filters.mode));
      if (filters?.subsidiaryId) conds.push(eq(engagement.subsidiaryId, filters.subsidiaryId));
      return tx
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
        .where(and(...conds))
        .orderBy(asc(engagement.createdAt));
    });
    return rows.map((row) => ({
      id: row.id,
      title: resolveLocalized(row.titleI18n, locale),
      mode: row.mode,
      state: row.state,
      subsidiary: resolveLocalized(row.subsidiaryName, locale),
      auditType: row.auditTypeName ? resolveLocalized(row.auditTypeName, locale) : null,
    }));
  }

  /**
   * T-H46: cockpit жизненного цикла аудитов. Сводка строится поверх state machine,
   * план/факт вех, чеклиста, ответов, замечаний и состава команды — без мутаций.
   */
  async workflowSummary(tenantId: string, userId: string, locale: Locale) {
    const now = new Date();
    const scope = await resolveAuditorScope(this.dbService, tenantId, userId);
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const conds = [isNull(engagement.deletedAt), isNull(engagement.archivedAt)];
      if (scope !== null) {
        conds.push(scope.length === 0 ? sql`false` : inArray(engagement.subsidiaryId, scope));
      }
      const rows = await tx
        .select({
          id: engagement.id,
          titleI18n: engagement.titleI18n,
          state: engagement.state,
          pausedFromState: engagement.pausedFromState,
          mode: engagement.mode,
          subsidiaryName: subsidiary.nameI18n,
        })
        .from(engagement)
        .innerJoin(subsidiary, eq(engagement.subsidiaryId, subsidiary.id))
        .where(and(...conds))
        .orderBy(asc(engagement.createdAt));
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) {
        return { rows, milestones: [], checklist: [], answered: [], findings: [], members: [] };
      }
      const milestones = await tx
        .select({
          engagementId: engagementMilestone.engagementId,
          stage: engagementMilestone.stage,
          plannedDate: engagementMilestone.plannedDate,
          actualDate: engagementMilestone.actualDate,
        })
        .from(engagementMilestone)
        .where(inArray(engagementMilestone.engagementId, ids));
      const checklist = await tx
        .select({ engagementId: checklistItem.engagementId, id: checklistItem.id })
        .from(checklistItem)
        .where(inArray(checklistItem.engagementId, ids));
      const answered = await tx
        .select({
          engagementId: checklistItem.engagementId,
          count: sql<number>`count(*)::int`,
        })
        .from(response)
        .innerJoin(checklistItem, eq(response.checklistItemId, checklistItem.id))
        .where(inArray(checklistItem.engagementId, ids))
        .groupBy(checklistItem.engagementId);
      const findings = await tx
        .select({
          engagementId: finding.engagementId,
          count: sql<number>`count(*)::int`,
        })
        .from(finding)
        .where(and(inArray(finding.engagementId, ids), isNull(finding.deletedAt)))
        .groupBy(finding.engagementId);
      const members = await tx
        .select({
          engagementId: engagementMember.engagementId,
          count: sql<number>`count(*)::int`,
        })
        .from(engagementMember)
        .where(inArray(engagementMember.engagementId, ids))
        .groupBy(engagementMember.engagementId);
      return { rows, milestones, checklist, answered, findings, members };
    });

    const checklistCount = new Map<string, number>();
    for (const item of data.checklist) {
      checklistCount.set(item.engagementId, (checklistCount.get(item.engagementId) ?? 0) + 1);
    }
    const answeredCount = new Map(data.answered.map((r) => [r.engagementId, r.count]));
    const findingCount = new Map(data.findings.map((r) => [r.engagementId, r.count]));
    const memberCount = new Map(data.members.map((r) => [r.engagementId, r.count]));
    const milestonesByEngagement = new Map<string, typeof data.milestones>();
    for (const m of data.milestones) {
      const existing = milestonesByEngagement.get(m.engagementId) ?? [];
      existing.push(m);
      milestonesByEngagement.set(m.engagementId, existing);
    }

    const byPhase = WORKFLOW_PHASES.map((phase, index) => ({
      phase: phase.key,
      order: index + 1,
      states: phase.states,
      count: 0,
      percent: 0,
    }));
    const phaseRows = new Map(byPhase.map((p) => [p.phase, p]));

    const blockers: {
      engagementId: string;
      title: string;
      subsidiary: string;
      state: string;
      phase: WorkflowPhaseKey;
      reason: WorkflowBlockerReason;
      checklistTotal: number;
      answered: number;
      findings: number;
      dueAt: string | null;
    }[] = [];
    let progressTotal = 0;

    for (const row of data.rows) {
      const effectiveState =
        row.state === 'paused' ? (row.pausedFromState ?? row.state) : row.state;
      const phase = phaseForState(effectiveState);
      const phaseRow = phaseRows.get(phase);
      if (phaseRow) phaseRow.count += 1;

      const stageIndex = Math.max(
        0,
        ENGAGEMENT_FLOW.indexOf(effectiveState as (typeof ENGAGEMENT_FLOW)[number]),
      );
      progressTotal += Math.round(((stageIndex + 1) / ENGAGEMENT_FLOW.length) * 100);

      const total = checklistCount.get(row.id) ?? 0;
      const answered = answeredCount.get(row.id) ?? 0;
      const findingsTotal = findingCount.get(row.id) ?? 0;
      const milestones = milestonesByEngagement.get(row.id) ?? [];
      const overdueMilestone = milestones
        .filter((m) => m.plannedDate !== null && m.actualDate === null && m.plannedDate < now)
        .sort((a, b) => Number(a.plannedDate) - Number(b.plannedDate))[0];

      let reason: WorkflowBlockerReason | null = null;
      let dueAt: string | null = null;
      if (row.state === 'paused') reason = 'paused';
      else if (overdueMilestone) {
        reason = 'milestone_overdue';
        dueAt = overdueMilestone.plannedDate?.toISOString() ?? null;
      } else if (total === 0 && phase === 'scoping') reason = 'no_checklist';
      else if (
        total > 0 &&
        answered < total &&
        (phase === 'data_collection' || effectiveState === 'issued_to_respondents')
      ) {
        reason = 'awaiting_responses';
      } else if (findingsTotal > 0 && phase === 'findings') {
        reason = 'findings_in_review';
      }

      if (reason) {
        blockers.push({
          engagementId: row.id,
          title: resolveLocalized(row.titleI18n, locale),
          subsidiary: resolveLocalized(row.subsidiaryName, locale),
          state: row.state,
          phase,
          reason,
          checklistTotal: total,
          answered,
          findings: findingsTotal,
          dueAt,
        });
      }
    }

    const total = data.rows.length;
    const phaseSummary = byPhase.map((p) => ({
      ...p,
      percent: total === 0 ? 0 : Math.round((p.count / total) * 100),
    }));
    const active = data.rows.filter((r) => r.state !== 'closed' && r.state !== 'paused').length;
    const paused = data.rows.filter((r) => r.state === 'paused').length;
    const closed = data.rows.filter((r) => r.state === 'closed').length;
    const withTeam = data.rows.filter((r) => (memberCount.get(r.id) ?? 0) > 0).length;

    return {
      generatedAt: now.toISOString(),
      total,
      active,
      paused,
      closed,
      withTeam,
      averageProgressPercent: total === 0 ? 0 : Math.round(progressTotal / total),
      byPhase: phaseSummary,
      topBlockers: blockers.slice(0, 6),
    };
  }

  async detail(tenantId: string, userId: string, id: string, locale: Locale) {
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
      const checklist = await tx
        .select()
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, id))
        .orderBy(asc(checklistItem.order));
      const responses = checklist.length
        ? await tx
            .select({
              checklistItemId: response.checklistItemId,
              text: response.text,
              complianceStatus: response.complianceStatus,
              submittedAt: response.submittedAt,
              respondent: user.fullName,
            })
            .from(response)
            .innerJoin(membership, eq(response.respondentMembershipId, membership.id))
            .innerJoin(user, eq(membership.userId, user.id))
            .where(
              inArray(
                response.checklistItemId,
                checklist.map((i) => i.id),
              ),
            )
        : [];
      return { row, sub, type, milestones, checklist, responses };
    });

    // T-122: чтение по ID режется auditor-scope так же, как список (T-111).
    await assertSubsidiaryInAuditorScope(this.dbService, tenantId, userId, data.row.subsidiaryId);

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
      checklist: data.checklist.map((item) => {
        const answer = data.responses.find((r) => r.checklistItemId === item.id);
        return {
          id: item.id,
          ref: item.ref,
          domainCode: item.domainCode,
          objective: resolveLocalized(item.objectiveI18n, locale),
          question: resolveLocalized(item.questionI18n, locale),
          status: item.status,
          controlId: item.controlId,
          response: answer
            ? {
                text: answer.text,
                complianceStatus: answer.complianceStatus,
                submittedAt: answer.submittedAt.toISOString(),
                respondent: answer.respondent,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Гранулярный экспорт одного engagement (BCK-04, T-H10): машинный JSON-снимок
   * с raw-полями (i18n не резолвим — для портируемости/архива/бэкапа одного аудита).
   * Restore/import через окружения — отдельный атом (ремап ID/конфликты).
   */
  async exportEngagement(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [eng] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, id), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${id} не найден`);
      const checklist = await tx
        .select()
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, id))
        .orderBy(asc(checklistItem.order));
      const responses = checklist.length
        ? await tx
            .select()
            .from(response)
            .where(
              inArray(
                response.checklistItemId,
                checklist.map((i) => i.id),
              ),
            )
        : [];
      const findings = await tx
        .select()
        .from(finding)
        .where(and(eq(finding.engagementId, id), isNull(finding.deletedAt)));
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        engagement: eng,
        checklist,
        responses,
        findings,
      };
    });
  }

  /**
   * Детерминированный assist findings (EP-AI срез, T-H15): гэп-детект по несоответствующим
   * пунктам чеклиста без finding → черновики-предложения (без LLM).
   */
  async findingSuggestions(tenantId: string, id: string, locale: Locale) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const items = await tx
        .select({
          id: checklistItem.id,
          ref: checklistItem.ref,
          questionI18n: checklistItem.questionI18n,
        })
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, id))
        .orderBy(asc(checklistItem.order));
      if (items.length === 0) return { suggestions: [] };
      const itemIds = items.map((i) => i.id);
      const responses = await tx
        .select({
          id: response.id,
          checklistItemId: response.checklistItemId,
          text: response.text,
          complianceStatus: response.complianceStatus,
        })
        .from(response)
        .where(inArray(response.checklistItemId, itemIds));
      const findings = await tx
        .select({ checklistItemId: finding.checklistItemId })
        .from(finding)
        .where(and(inArray(finding.checklistItemId, itemIds), isNull(finding.deletedAt)));
      const responseBy = new Map(responses.map((r) => [r.checklistItemId, r]));
      const withFinding = new Set(findings.map((f) => f.checklistItemId));
      const responseIds = responses.map((r) => r.id);
      const evidenceTargets = [...itemIds, ...responseIds, id];
      const evidence =
        evidenceTargets.length > 0
          ? await tx
              .select({
                documentId: document.id,
                filename: document.filename,
                relation: documentLink.relation,
                entityType: documentLink.entityType,
                entityId: documentLink.entityId,
              })
              .from(documentLink)
              .innerJoin(document, eq(documentLink.documentId, document.id))
              .where(
                and(inArray(documentLink.entityId, evidenceTargets), isNull(document.deletedAt)),
              )
          : [];
      const engagementEvidence = evidence
        .filter((e) => e.entityType === 'engagement' && e.entityId === id)
        .map((e) => ({
          documentId: e.documentId,
          filename: e.filename,
          relation: e.relation,
          location: 'engagement',
        }));
      const input = items.map((i) => ({
        checklistItemId: i.id,
        ref: i.ref,
        question: resolveLocalized(i.questionI18n, locale),
        responseText: responseBy.get(i.id)?.text ?? null,
        complianceStatus: responseBy.get(i.id)?.complianceStatus ?? null,
        hasFinding: withFinding.has(i.id),
        evidenceReferences: [
          ...evidence
            .filter((e) => e.entityType === 'checklist_item' && e.entityId === i.id)
            .map((e) => ({
              documentId: e.documentId,
              filename: e.filename,
              relation: e.relation,
              location: i.ref ? `checklist item ${i.ref}` : 'checklist item',
            })),
          ...evidence
            .filter((e) => e.entityType === 'response' && e.entityId === responseBy.get(i.id)?.id)
            .map((e) => ({
              documentId: e.documentId,
              filename: e.filename,
              relation: e.relation,
              location: i.ref ? `response for ${i.ref}` : 'response',
            })),
          ...engagementEvidence,
        ].slice(0, 3),
      }));
      return { suggestions: suggestFindings(input) };
    });
  }

  /**
   * Гранулярное восстановление/дублирование одного аудита (BCK-04 restore, T-H16):
   * копия engagement + checklist + responses + findings с новыми ID (ремап FK).
   * Внутри-процессно (без JSON round-trip) → даты/jsonb сохраняются. Тот же тенант.
   */
  async duplicateEngagement(actor: Actor, id: string) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, id), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${id} не найден`);

      const { id: _eid, createdAt: _ec, updatedAt: _eu, ...engRest } = eng;
      const srcTitle = eng.titleI18n as I18nText;
      const [newEng] = await tx
        .insert(engagement)
        .values({
          ...engRest,
          titleI18n: { ...srcTitle, en: `${srcTitle.en} (restored)` },
          archivedAt: null,
          deletedAt: null,
        })
        .returning({ id: engagement.id });
      const newEngId = newEng!.id;

      const items = await tx.select().from(checklistItem).where(eq(checklistItem.engagementId, id));
      const itemMap = new Map<string, string>();
      for (const it of items) {
        const { id: oldId, createdAt: _c, updatedAt: _u, ...rest } = it;
        const [ni] = await tx
          .insert(checklistItem)
          .values({ ...rest, engagementId: newEngId })
          .returning({ id: checklistItem.id });
        itemMap.set(oldId, ni!.id);
      }

      const respMap = new Map<string, string>();
      if (items.length > 0) {
        const responses = await tx
          .select()
          .from(response)
          .where(
            inArray(
              response.checklistItemId,
              items.map((i) => i.id),
            ),
          );
        for (const r of responses) {
          const { id: oldId, createdAt: _c, updatedAt: _u, ...rest } = r;
          const [nr] = await tx
            .insert(response)
            .values({
              ...rest,
              checklistItemId: itemMap.get(r.checklistItemId) ?? rest.checklistItemId,
            })
            .returning({ id: response.id });
          respMap.set(oldId, nr!.id);
        }
      }

      const findings = await tx
        .select()
        .from(finding)
        .where(and(eq(finding.engagementId, id), isNull(finding.deletedAt)));
      for (const f of findings) {
        const { id: _fid, createdAt: _c, updatedAt: _u, ...rest } = f;
        await tx.insert(finding).values({
          ...rest,
          engagementId: newEngId,
          checklistItemId: f.checklistItemId ? (itemMap.get(f.checklistItemId) ?? null) : null,
          responseId: f.responseId ? (respMap.get(f.responseId) ?? null) : null,
        });
      }

      return { id: newEngId, checklist: items.length, findings: findings.length };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'engagement.duplicated',
      entityType: 'engagement',
      entityId: created.id,
      after: { source: id, ...created },
    });
    return created;
  }

  // --- T-116: состав аудит-команды на engagement (engagement_member) ---

  /** Назначить участника на engagement с ролью (upsert по engagement+membership). */
  async assignMember(
    actor: Actor,
    engagementId: string,
    input: {
      membershipId: string;
      engagementRole: string;
      stagePermissions?: Record<string, string> | null;
    },
  ) {
    const role = engagementRoleSchema.safeParse(input.engagementRole);
    if (!role.success) {
      throw new BadRequestException('engagementRole: lead|assessor|reviewer|approver|observer');
    }
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagement.id })
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);
      const [m] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.id, input.membershipId), eq(membership.tenantId, actor.tenantId)));
      if (!m) throw new BadRequestException('membershipId не найден в тенанте');
      const [row] = await tx
        .insert(engagementMember)
        .values({
          tenantId: actor.tenantId,
          engagementId,
          membershipId: input.membershipId,
          engagementRole: role.data,
          stagePermissions: input.stagePermissions ?? null,
        })
        .onConflictDoUpdate({
          target: [engagementMember.engagementId, engagementMember.membershipId],
          set: { engagementRole: role.data, stagePermissions: input.stagePermissions ?? null },
        })
        .returning();
      return row!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'engagement.member_assigned',
      entityType: 'engagement_member',
      entityId: created.id,
      after: { engagementId, membershipId: input.membershipId, engagementRole: role.data },
    });
    return { id: created.id, engagementRole: created.engagementRole };
  }

  /** Состав команды engagement с именами и ролями. */
  async listMembers(tenantId: string, engagementId: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: engagementMember.id,
          membershipId: engagementMember.membershipId,
          engagementRole: engagementMember.engagementRole,
          stagePermissions: engagementMember.stagePermissions,
          fullName: user.fullName,
          email: user.email,
        })
        .from(engagementMember)
        .innerJoin(membership, eq(engagementMember.membershipId, membership.id))
        .innerJoin(user, eq(membership.userId, user.id))
        .where(eq(engagementMember.engagementId, engagementId))
        .orderBy(asc(user.fullName)),
    );
  }

  /** Снять участника с engagement. */
  async removeMember(actor: Actor, engagementId: string, memberId: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .delete(engagementMember)
        .where(
          and(eq(engagementMember.id, memberId), eq(engagementMember.engagementId, engagementId)),
        )
        .returning();
      return row;
    });
    if (!removed) throw new NotFoundException('Член команды не найден');
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'engagement.member_removed',
      entityType: 'engagement_member',
      entityId: memberId,
      before: { membershipId: removed.membershipId, engagementRole: removed.engagementRole },
    });
    return { id: memberId };
  }
}
