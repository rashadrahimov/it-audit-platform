import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { I18nText } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditProgram, engagement, programStep } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

interface StepInput {
  titleI18n: I18nText;
  instructionsI18n?: I18nText;
  order?: number;
}

@Injectable()
export class AuditProgramsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      titleI18n: I18nText;
      engagementId?: string;
      subjectArea?: string;
      steps?: StepInput[];
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      if (input.engagementId) {
        const [eng] = await tx
          .select({ id: engagement.id })
          .from(engagement)
          .where(and(eq(engagement.id, input.engagementId), isNull(engagement.deletedAt)));
        if (!eng) throw new BadRequestException(`Engagement ${input.engagementId} не найден`);
      }
      const [prog] = await tx
        .insert(auditProgram)
        .values({
          tenantId: actor.tenantId,
          engagementId: input.engagementId ?? null,
          subjectArea: input.subjectArea ?? null,
          titleI18n: input.titleI18n,
        })
        .returning();
      if (!prog) throw new Error('Программа не создалась');
      const steps = input.steps ?? [];
      for (let i = 0; i < steps.length; i += 1) {
        const s = steps[i]!;
        await tx.insert(programStep).values({
          programId: prog.id,
          order: s.order ?? i,
          titleI18n: s.titleI18n,
          instructionsI18n: s.instructionsI18n ?? null,
        });
      }
      return { id: prog.id, steps: steps.length };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'audit_program.created',
      entityType: 'audit_program',
      entityId: created.id,
      after: { steps: created.steps, isTemplate: !input.engagementId },
    });
    return created;
  }

  /** Roll-forward (ENG-05): клонировать программу в новый engagement с origin-ссылкой, статусы сброшены. */
  async rollForward(actor: Actor, programId: string, targetEngagementId: string) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [src] = await tx
        .select()
        .from(auditProgram)
        .where(and(eq(auditProgram.id, programId), isNull(auditProgram.deletedAt)));
      if (!src) throw new NotFoundException(`Программа ${programId} не найдена`);
      const [eng] = await tx
        .select({ id: engagement.id })
        .from(engagement)
        .where(and(eq(engagement.id, targetEngagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new BadRequestException(`Целевой engagement ${targetEngagementId} не найден`);
      const [clone] = await tx
        .insert(auditProgram)
        .values({
          tenantId: actor.tenantId,
          engagementId: targetEngagementId,
          originProgramId: src.id,
          subjectArea: src.subjectArea,
          titleI18n: src.titleI18n,
        })
        .returning();
      const srcSteps = await tx
        .select()
        .from(programStep)
        .where(eq(programStep.programId, src.id))
        .orderBy(asc(programStep.order));
      for (const s of srcSteps) {
        await tx.insert(programStep).values({
          programId: clone!.id,
          order: s.order,
          titleI18n: s.titleI18n,
          instructionsI18n: s.instructionsI18n,
          status: 'pending', // roll-forward сбрасывает статусы
        });
      }
      return { id: clone!.id, originProgramId: src.id, steps: srcSteps.length };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'audit_program.rolled_forward',
      entityType: 'audit_program',
      entityId: created.id,
      after: { originProgramId: created.originProgramId, steps: created.steps },
    });
    return created;
  }

  async list(tenantId: string, engagementId?: string) {
    return this.dbService.withTenant(tenantId, (tx) => {
      const conds = [isNull(auditProgram.deletedAt)];
      if (engagementId) conds.push(eq(auditProgram.engagementId, engagementId));
      return tx
        .select({
          id: auditProgram.id,
          titleI18n: auditProgram.titleI18n,
          subjectArea: auditProgram.subjectArea,
          engagementId: auditProgram.engagementId,
          originProgramId: auditProgram.originProgramId,
        })
        .from(auditProgram)
        .where(and(...conds));
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [prog] = await tx
        .select()
        .from(auditProgram)
        .where(and(eq(auditProgram.id, id), isNull(auditProgram.deletedAt)));
      if (!prog) throw new NotFoundException(`Программа ${id} не найдена`);
      const steps = await tx
        .select({
          id: programStep.id,
          order: programStep.order,
          titleI18n: programStep.titleI18n,
          status: programStep.status,
        })
        .from(programStep)
        .where(eq(programStep.programId, id))
        .orderBy(asc(programStep.order));
      return {
        id: prog.id,
        titleI18n: prog.titleI18n,
        subjectArea: prog.subjectArea,
        engagementId: prog.engagementId,
        originProgramId: prog.originProgramId,
        isTemplate: prog.engagementId === null,
        steps,
      };
    });
  }
}
