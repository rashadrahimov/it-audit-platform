import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { auditableEntity, control, risk, riskControl, riskEntity, riskMatrixConfig } from '../db/schema';
import { classifyRisk, DEFAULT_THRESHOLDS } from './classify-risk';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface CreateRiskInput {
  titleI18n: I18nText;
  descriptionI18n?: I18nText;
  domain?: string;
  category?: string;
  inherentImpact?: number;
  inherentLikelihood?: number;
  residualImpact?: number;
  residualLikelihood?: number;
  treatment?: string;
  ownerMembershipId?: string;
  subsidiaryId?: string;
}

/** Risk register (T-057, B6): скоринг по матрице тенанта, risk_class computed. */
@Injectable()
export class RisksService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async thresholds(
    tx: Parameters<Parameters<DbService['withTenant']>[1]>[0],
    tenantId: string,
  ) {
    const [cfg] = await tx
      .select()
      .from(riskMatrixConfig)
      .where(eq(riskMatrixConfig.tenantId, tenantId));
    return cfg?.thresholds ?? DEFAULT_THRESHOLDS;
  }

  async setMatrix(
    actor: Actor,
    input: {
      impactScale?: number;
      likelihoodScale?: number;
      thresholds: typeof DEFAULT_THRESHOLDS;
    },
  ) {
    return this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(riskMatrixConfig)
        .where(eq(riskMatrixConfig.tenantId, actor.tenantId));
      if (existing) {
        const [row] = await tx
          .update(riskMatrixConfig)
          .set({
            impactScale: input.impactScale ?? existing.impactScale,
            likelihoodScale: input.likelihoodScale ?? existing.likelihoodScale,
            thresholds: input.thresholds,
          })
          .where(eq(riskMatrixConfig.id, existing.id))
          .returning();
        return row;
      }
      const [row] = await tx
        .insert(riskMatrixConfig)
        .values({
          tenantId: actor.tenantId,
          impactScale: input.impactScale ?? 5,
          likelihoodScale: input.likelihoodScale ?? 5,
          thresholds: input.thresholds,
        })
        .returning();
      return row;
    });
  }

  async create(actor: Actor, input: CreateRiskInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const thresholds = await this.thresholds(tx, actor.tenantId);
      const [row] = await tx
        .insert(risk)
        .values({
          tenantId: actor.tenantId,
          subsidiaryId: input.subsidiaryId ?? null,
          domain: input.domain ?? null,
          titleI18n: input.titleI18n,
          descriptionI18n: input.descriptionI18n ?? null,
          category: input.category ?? null,
          inherentImpact: input.inherentImpact ?? null,
          inherentLikelihood: input.inherentLikelihood ?? null,
          residualImpact: input.residualImpact ?? null,
          residualLikelihood: input.residualLikelihood ?? null,
          riskClass: classifyRisk(input.inherentImpact, input.inherentLikelihood, thresholds),
          residualClass: classifyRisk(input.residualImpact, input.residualLikelihood, thresholds),
          treatment: input.treatment ?? null,
          ownerMembershipId: input.ownerMembershipId ?? null,
        })
        .returning();
      if (!row) throw new Error('Риск не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk.created',
      entityType: 'risk',
      entityId: created.id,
      after: { title: created.titleI18n.en, riskClass: created.riskClass },
    });
    return created;
  }

  /** Пересчёт скоринга при изменении impact/likelihood. */
  async rescore(
    actor: Actor,
    id: string,
    input: {
      inherentImpact?: number;
      inherentLikelihood?: number;
      residualImpact?: number;
      residualLikelihood?: number;
    },
  ) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(risk)
        .where(and(eq(risk.id, id), isNull(risk.deletedAt)));
      if (!row) throw new NotFoundException(`Риск ${id} не найден`);
      const thresholds = await this.thresholds(tx, actor.tenantId);
      const inherentImpact = input.inherentImpact ?? row.inherentImpact;
      const inherentLikelihood = input.inherentLikelihood ?? row.inherentLikelihood;
      const residualImpact = input.residualImpact ?? row.residualImpact;
      const residualLikelihood = input.residualLikelihood ?? row.residualLikelihood;
      const [res] = await tx
        .update(risk)
        .set({
          inherentImpact,
          inherentLikelihood,
          residualImpact,
          residualLikelihood,
          riskClass: classifyRisk(inherentImpact, inherentLikelihood, thresholds),
          residualClass: classifyRisk(residualImpact, residualLikelihood, thresholds),
        })
        .where(eq(risk.id, id))
        .returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk.rescored',
      entityType: 'risk',
      entityId: id,
      after: { riskClass: updated.riskClass, residualClass: updated.residualClass },
    });
    return { riskClass: updated.riskClass, residualClass: updated.residualClass };
  }

  /** RCM (T-058): привязать митигирующие контроли к риску (M:N). */
  /** T-066: привязка риска к узлам audit universe (risk_entity, M:N). */
  async linkEntities(actor: Actor, riskId: string, entityIds: string[]) {
    const linked = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [r] = await tx
        .select({ id: risk.id })
        .from(risk)
        .where(and(eq(risk.id, riskId), isNull(risk.deletedAt)));
      if (!r) throw new NotFoundException(`Риск ${riskId} не найден`);
      const nodes = await tx
        .select({ id: auditableEntity.id })
        .from(auditableEntity)
        .where(and(inArray(auditableEntity.id, entityIds), isNull(auditableEntity.deletedAt)));
      if (nodes.length !== entityIds.length) {
        throw new BadRequestException('Часть узлов universe не найдена');
      }
      let added = 0;
      for (const n of nodes) {
        const [row] = await tx
          .insert(riskEntity)
          .values({ riskId, auditableEntityId: n.id })
          .onConflictDoNothing()
          .returning();
        if (row) added += 1;
      }
      return added;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk.entities_linked',
      entityType: 'risk',
      entityId: riskId,
      after: { added: linked },
    });
    return { linked };
  }

  async entitiesOf(tenantId: string, riskId: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: auditableEntity.id, kind: auditableEntity.kind, nameI18n: auditableEntity.nameI18n })
        .from(riskEntity)
        .innerJoin(auditableEntity, eq(riskEntity.auditableEntityId, auditableEntity.id))
        .where(eq(riskEntity.riskId, riskId)),
    );
  }

  async linkControls(actor: Actor, riskId: string, controlIds: string[]) {
    const linked = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [r] = await tx
        .select({ id: risk.id })
        .from(risk)
        .where(and(eq(risk.id, riskId), isNull(risk.deletedAt)));
      if (!r) throw new NotFoundException(`Риск ${riskId} не найден`);
      const controls = await tx
        .select({ id: control.id })
        .from(control)
        .where(and(inArray(control.id, controlIds), isNull(control.deletedAt)));
      if (controls.length !== controlIds.length) {
        throw new BadRequestException('Часть контролей не найдена');
      }
      let added = 0;
      for (const c of controls) {
        const [row] = await tx
          .insert(riskControl)
          .values({ riskId, controlId: c.id })
          .onConflictDoNothing()
          .returning();
        if (row) added += 1;
      }
      return added;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk.controls_linked',
      entityType: 'risk',
      entityId: riskId,
      after: { added: linked },
    });
    return { linked };
  }

  /** Митигирующие контроли риска. */
  async controlsOf(tenantId: string, riskId: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: control.id, ref: control.ref })
        .from(riskControl)
        .innerJoin(control, eq(riskControl.controlId, control.id))
        .where(eq(riskControl.riskId, riskId)),
    );
  }

  /** Heat map (T-058): распределение рисков по классам (inherent и residual). */
  async heatmap(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ riskClass: risk.riskClass, residualClass: risk.residualClass })
        .from(risk)
        .where(isNull(risk.deletedAt)),
    );
    const empty = () => ({ low: 0, medium: 0, high: 0, critical: 0 });
    const inherent = empty();
    const residual = empty();
    for (const r of rows) {
      if (r.riskClass && r.riskClass in inherent)
        inherent[r.riskClass as keyof typeof inherent] += 1;
      if (r.residualClass && r.residualClass in residual)
        residual[r.residualClass as keyof typeof residual] += 1;
    }
    return { total: rows.length, inherent, residual };
  }

  async list(tenantId: string, locale: Locale) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(risk).where(isNull(risk.deletedAt)).orderBy(desc(risk.createdAt)),
    );
    return rows.map((r) => ({
      id: r.id,
      title: resolveLocalized(r.titleI18n, locale),
      domain: r.domain,
      riskClass: r.riskClass,
      residualClass: r.residualClass,
      treatment: r.treatment,
      status: r.status,
    }));
  }

  async detail(tenantId: string, id: string, locale: Locale) {
    const [r] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(risk)
        .where(and(eq(risk.id, id), isNull(risk.deletedAt))),
    );
    if (!r) throw new NotFoundException(`Риск ${id} не найден`);
    return {
      id: r.id,
      title: resolveLocalized(r.titleI18n, locale),
      description: r.descriptionI18n ? resolveLocalized(r.descriptionI18n, locale) : null,
      domain: r.domain,
      category: r.category,
      inherentImpact: r.inherentImpact,
      inherentLikelihood: r.inherentLikelihood,
      residualImpact: r.residualImpact,
      residualLikelihood: r.residualLikelihood,
      riskClass: r.riskClass,
      residualClass: r.residualClass,
      treatment: r.treatment,
      status: r.status,
    };
  }
}
