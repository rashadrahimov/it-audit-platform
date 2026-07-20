import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  auditableEntity,
  control,
  membership,
  risk,
  riskControl,
  riskEntity,
  riskMatrixConfig,
  user,
} from '../db/schema';
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

  /** Текущая матрица тенанта (T-V12): для формы настройки и шкал rescore. */
  async getMatrix(tenantId: string) {
    const [cfg] = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(riskMatrixConfig).where(eq(riskMatrixConfig.tenantId, tenantId)),
    );
    return {
      impactScale: cfg?.impactScale ?? 5,
      likelihoodScale: cfg?.likelihoodScale ?? 5,
      thresholds: cfg?.thresholds ?? DEFAULT_THRESHOLDS,
    };
  }

  /**
   * T-V23: глобальная библиотека risk-сценариев (tenant_id NULL, ADR-0016).
   * added — есть ли в реестре тенанта живой риск с source_risk_id на сценарий.
   */
  async library(tenantId: string, locale: Locale) {
    const rows = await this.dbService.db
      .select()
      .from(risk)
      .where(and(isNull(risk.tenantId), isNull(risk.deletedAt)))
      .orderBy(desc(risk.inherentImpact), desc(risk.inherentLikelihood));
    const added = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ sourceRiskId: risk.sourceRiskId })
        .from(risk)
        .where(and(isNotNull(risk.tenantId), isNull(risk.deletedAt), isNotNull(risk.sourceRiskId))),
    );
    const addedIds = new Set(added.map((a) => a.sourceRiskId));
    return rows.map((r) => ({
      id: r.id,
      title: resolveLocalized(r.titleI18n, locale),
      description: r.descriptionI18n ? resolveLocalized(r.descriptionI18n, locale) : null,
      category: r.category,
      inherentImpact: r.inherentImpact,
      inherentLikelihood: r.inherentLikelihood,
      added: addedIds.has(r.id),
    }));
  }

  /** T-V23: «Add to register» — копия сценария в реестр тенанта, класс по его матрице. */
  async addFromLibrary(actor: Actor, libraryRiskId: string) {
    const [item] = await this.dbService.db
      .select()
      .from(risk)
      .where(and(eq(risk.id, libraryRiskId), isNull(risk.tenantId), isNull(risk.deletedAt)));
    if (!item) throw new NotFoundException(`Сценарий ${libraryRiskId} не найден в библиотеке`);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      // идемпотентность: живой риск с этим source уже есть — не дублируем
      const [existing] = await tx
        .select({ id: risk.id })
        .from(risk)
        .where(
          and(
            eq(risk.sourceRiskId, libraryRiskId),
            isNotNull(risk.tenantId),
            isNull(risk.deletedAt),
          ),
        );
      if (existing) return { row: null, id: existing.id };
      const thresholds = await this.thresholds(tx, actor.tenantId);
      const [row] = await tx
        .insert(risk)
        .values({
          tenantId: actor.tenantId,
          titleI18n: item.titleI18n,
          descriptionI18n: item.descriptionI18n,
          category: item.category,
          inherentImpact: item.inherentImpact,
          inherentLikelihood: item.inherentLikelihood,
          riskClass: classifyRisk(item.inherentImpact, item.inherentLikelihood, thresholds),
          sourceRiskId: libraryRiskId,
          status: 'open',
        })
        .returning();
      return { row: row!, id: row!.id };
    });
    if (created.row) {
      await this.auditLogService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorIp: actor.ip,
        action: 'risk.added_from_library',
        entityType: 'risk',
        entityId: created.id,
        after: { title: item.titleI18n.en, sourceRiskId: libraryRiskId },
      });
    }
    return { id: created.id, added: created.row !== null };
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
        .where(and(eq(risk.id, id), isNotNull(risk.tenantId), isNull(risk.deletedAt)));
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

  /** T-V12: частичное редактирование карточки (treatment/статус/owner/атрибуты). */
  async update(
    actor: Actor,
    id: string,
    input: {
      titleI18n?: I18nText;
      descriptionI18n?: I18nText;
      domain?: string | null;
      category?: string | null;
      treatment?: string | null;
      status?: string;
      ownerMembershipId?: string | null;
    },
  ) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: risk.id })
        .from(risk)
        .where(and(eq(risk.id, id), isNotNull(risk.tenantId), isNull(risk.deletedAt)));
      if (!row) throw new NotFoundException(`Риск ${id} не найден`);
      if (input.ownerMembershipId) {
        // membership над-тенантная (без RLS) — проверяем принадлежность тенанту явно
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.id, input.ownerMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!m) throw new BadRequestException('ownerMembershipId: участник не найден');
      }
      const patch: Record<string, unknown> = {};
      if (input.titleI18n !== undefined) patch.titleI18n = input.titleI18n;
      if (input.descriptionI18n !== undefined) patch.descriptionI18n = input.descriptionI18n;
      if (input.domain !== undefined) patch.domain = input.domain;
      if (input.category !== undefined) patch.category = input.category;
      if (input.treatment !== undefined) patch.treatment = input.treatment;
      if (input.status !== undefined) patch.status = input.status;
      if (input.ownerMembershipId !== undefined) patch.ownerMembershipId = input.ownerMembershipId;
      const [res] = await tx.update(risk).set(patch).where(eq(risk.id, id)).returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk.updated',
      entityType: 'risk',
      entityId: id,
      after: {
        treatment: updated.treatment,
        status: updated.status,
        ownerMembershipId: updated.ownerMembershipId,
      },
    });
    return { id: updated.id, treatment: updated.treatment, status: updated.status };
  }

  /** T-V12: soft delete риска (deleted_at; связи rcm/universe остаются в истории). */
  async remove(actor: Actor, id: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: risk.id, titleI18n: risk.titleI18n })
        .from(risk)
        .where(and(eq(risk.id, id), isNotNull(risk.tenantId), isNull(risk.deletedAt)));
      if (!row) throw new NotFoundException(`Риск ${id} не найден`);
      await tx.update(risk).set({ deletedAt: new Date() }).where(eq(risk.id, id));
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'risk.deleted',
      entityType: 'risk',
      entityId: id,
      before: { title: removed.titleI18n.en },
    });
    return { deleted: true };
  }

  /** RCM (T-058): привязать митигирующие контроли к риску (M:N). */
  /** T-066: привязка риска к узлам audit universe (risk_entity, M:N). */
  async linkEntities(actor: Actor, riskId: string, entityIds: string[]) {
    const linked = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [r] = await tx
        .select({ id: risk.id })
        .from(risk)
        .where(and(eq(risk.id, riskId), isNotNull(risk.tenantId), isNull(risk.deletedAt)));
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
        .select({
          id: auditableEntity.id,
          kind: auditableEntity.kind,
          nameI18n: auditableEntity.nameI18n,
        })
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
        .where(and(eq(risk.id, riskId), isNotNull(risk.tenantId), isNull(risk.deletedAt)));
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
        .where(and(isNotNull(risk.tenantId), isNull(risk.deletedAt))),
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

  /**
   * T-V35: настоящая матрица impact×likelihood — счётчик рисков в каждой ячейке
   * + класс ячейки по порогам тенанта. mode inherent|residual, срез по узлу universe
   * (процессу). Плюс топ категорий рисков и список узлов для селектора среза.
   */
  async heatmapMatrix(tenantId: string, locale: Locale, opts: { mode?: string; nodeId?: string }) {
    const mode = opts.mode === 'residual' ? 'residual' : 'inherent';
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [cfg] = await tx
        .select()
        .from(riskMatrixConfig)
        .where(eq(riskMatrixConfig.tenantId, tenantId));
      const impactScale = cfg?.impactScale ?? 5;
      const likelihoodScale = cfg?.likelihoodScale ?? 5;
      const thresholds = cfg?.thresholds ?? DEFAULT_THRESHOLDS;

      // опциональный срез по узлу universe (процессу): id рисков, привязанных к узлу
      let nodeRiskIds: Set<string> | null = null;
      if (opts.nodeId) {
        const links = await tx
          .select({ riskId: riskEntity.riskId })
          .from(riskEntity)
          .where(eq(riskEntity.auditableEntityId, opts.nodeId));
        nodeRiskIds = new Set(links.map((l) => l.riskId));
      }

      const rows = await tx
        .select({
          id: risk.id,
          category: risk.category,
          ii: risk.inherentImpact,
          il: risk.inherentLikelihood,
          ri: risk.residualImpact,
          rl: risk.residualLikelihood,
        })
        .from(risk)
        .where(and(isNotNull(risk.tenantId), isNull(risk.deletedAt)));
      const filtered = nodeRiskIds ? rows.filter((r) => nodeRiskIds!.has(r.id)) : rows;

      // ячейки I×L: счётчик рисков + класс ячейки по порогам
      const counts = new Map<string, number>();
      let total = 0;
      for (const r of filtered) {
        const impact = mode === 'residual' ? r.ri : r.ii;
        const likelihood = mode === 'residual' ? r.rl : r.il;
        if (!impact || !likelihood) continue;
        const key = `${impact}:${likelihood}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total += 1;
      }
      const cells: Array<{
        impact: number;
        likelihood: number;
        count: number;
        cellClass: string | null;
      }> = [];
      for (let i = 1; i <= impactScale; i += 1) {
        for (let l = 1; l <= likelihoodScale; l += 1) {
          cells.push({
            impact: i,
            likelihood: l,
            count: counts.get(`${i}:${l}`) ?? 0,
            cellClass: classifyRisk(i, l, thresholds),
          });
        }
      }

      // топ категорий рисков (по числу в срезе)
      const catCounts = new Map<string, number>();
      for (const r of filtered) {
        const c = r.category ?? 'uncategorized';
        catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
      }
      const topCategories = [...catCounts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // узлы universe, к которым привязан хотя бы один риск — для селектора среза
      const nodeRows = await tx
        .select({
          id: auditableEntity.id,
          kind: auditableEntity.kind,
          nameI18n: auditableEntity.nameI18n,
        })
        .from(riskEntity)
        .innerJoin(auditableEntity, eq(riskEntity.auditableEntityId, auditableEntity.id));
      const nodesById = new Map<string, { id: string; kind: string; name: string }>();
      for (const n of nodeRows) {
        if (!nodesById.has(n.id)) {
          nodesById.set(n.id, {
            id: n.id,
            kind: n.kind,
            name: resolveLocalized(n.nameI18n, locale),
          });
        }
      }

      return {
        mode,
        impactScale,
        likelihoodScale,
        thresholds,
        total,
        cells,
        topCategories,
        nodes: [...nodesById.values()],
        nodeId: opts.nodeId ?? null,
      };
    });
  }

  async list(tenantId: string, locale: Locale) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(risk)
        .where(and(isNotNull(risk.tenantId), isNull(risk.deletedAt)))
        .orderBy(desc(risk.createdAt)),
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
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ risk: risk, ownerName: user.fullName })
        .from(risk)
        .leftJoin(membership, eq(risk.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(eq(risk.id, id), isNotNull(risk.tenantId), isNull(risk.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Риск ${id} не найден`);
    const r = row.risk;
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
      ownerMembershipId: r.ownerMembershipId,
      owner: row.ownerName,
    };
  }
}
