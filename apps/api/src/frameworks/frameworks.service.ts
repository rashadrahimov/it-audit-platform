import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  checklistItem,
  control,
  controlMapping,
  document,
  documentLink,
  engagement,
  framework,
  frameworkActivation,
  frameworkRequirement,
  tenant,
} from '../db/schema';
import { summarizeEvidenceReuse } from './evidence-reuse';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface FrameworkListItem {
  id: string;
  name: string;
  nameI18n: { en: string; az?: string; ru?: string };
  version: string;
  status: string;
  domain: string | null;
  /** true — глобальная библиотека (ADR-0016), false — адаптация тенанта. */
  isGlobal: boolean;
  /** T-V25: активирован ли тенантом (null — тенант-контекст не передан). */
  isActive: boolean | null;
  sourceFrameworkId: string | null;
  /** T-V46: предыдущая версия (если это версия-потомок). */
  previousVersionId: string | null;
}

interface MappingRow {
  controlId: string;
  requirementId: string;
}

/**
 * Библиотека стандартов (T-030, ADR-0016). Без тенант-контекста RLS отдаёт
 * только глобальные строки; с tenantSlug — плюс адаптации тенанта и активации.
 */
@Injectable()
export class FrameworksService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(tenantSlug: string | undefined, locale: Locale): Promise<FrameworkListItem[]> {
    const collect = (db: Pick<typeof this.dbService.db, 'select'>) =>
      db
        .select()
        .from(framework)
        .where(isNull(framework.deletedAt))
        .orderBy(asc(framework.createdAt));

    let rows;
    let activeIds: Set<string> | null = null;
    if (!tenantSlug) {
      rows = await collect(this.dbService.db);
    } else {
      const [found] = await this.dbService.db
        .select()
        .from(tenant)
        .where(eq(tenant.slug, tenantSlug));
      if (!found) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);
      const collected = await this.dbService.withTenant(found.id, async (tx) => {
        const frameworks = await collect(tx);
        const activations = await tx
          .select({ frameworkId: frameworkActivation.frameworkId })
          .from(frameworkActivation);
        return { frameworks, activations };
      });
      rows = collected.frameworks;
      activeIds = new Set(collected.activations.map((a) => a.frameworkId));
    }

    return rows.map((row) => ({
      id: row.id,
      name: resolveLocalized(row.nameI18n, locale),
      nameI18n: row.nameI18n,
      version: row.version,
      status: row.status,
      domain: row.domain,
      isGlobal: row.tenantId === null,
      isActive: activeIds === null ? null : activeIds.has(row.id),
      sourceFrameworkId: row.sourceFrameworkId,
      previousVersionId: row.previousVersionId,
    }));
  }

  /** T-H40: cross-framework compliance mapping — один контрол может закрывать несколько стандартов. */
  async mappingSummary(tenantSlug: string | undefined, locale: Locale) {
    const collect = async (db: Pick<typeof this.dbService.db, 'select'>) => {
      const [frameworks, activations, controls, requirements, mappings, evidenceLinks] =
        await Promise.all([
          db
            .select({
              id: framework.id,
              nameI18n: framework.nameI18n,
              version: framework.version,
              deletedAt: framework.deletedAt,
            })
            .from(framework)
            .where(isNull(framework.deletedAt)),
          db.select({ frameworkId: frameworkActivation.frameworkId }).from(frameworkActivation),
          db
            .select({
              id: control.id,
              ref: control.ref,
              tenantId: control.tenantId,
              originControlId: control.originControlId,
              objectiveI18n: control.objectiveI18n,
            })
            .from(control)
            .where(isNull(control.deletedAt)),
          db
            .select({
              id: frameworkRequirement.id,
              ref: frameworkRequirement.ref,
              frameworkId: frameworkRequirement.frameworkId,
            })
            .from(frameworkRequirement),
          db
            .select({
              controlId: controlMapping.controlId,
              requirementId: controlMapping.requirementId,
            })
            .from(controlMapping),
          db
            .select({
              documentId: documentLink.documentId,
              filename: document.filename,
              entityId: documentLink.entityId,
              relation: documentLink.relation,
              reviewStatus: documentLink.reviewStatus,
            })
            .from(documentLink)
            .innerJoin(document, eq(documentLink.documentId, document.id))
            .where(and(eq(documentLink.entityType, 'control'), isNull(document.deletedAt))),
        ]);
      return { frameworks, activations, controls, requirements, mappings, evidenceLinks };
    };

    let data: Awaited<ReturnType<typeof collect>>;
    let tenantId: string | null = null;
    if (!tenantSlug) {
      data = await collect(this.dbService.db);
    } else {
      const [found] = await this.dbService.db
        .select({ id: tenant.id })
        .from(tenant)
        .where(eq(tenant.slug, tenantSlug));
      if (!found) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);
      tenantId = found.id;
      data = await this.dbService.withTenant(found.id, collect);
    }

    const activeIds =
      tenantSlug && data.activations.length > 0
        ? new Set(data.activations.map((a) => a.frameworkId))
        : new Set(data.frameworks.map((fw) => fw.id));
    const activeFrameworks = data.frameworks.filter((fw) => activeIds.has(fw.id));
    const frameworkById = new Map(activeFrameworks.map((fw) => [fw.id, fw]));
    const requirements = data.requirements.filter((r) => activeIds.has(r.frameworkId));
    const reqById = new Map(requirements.map((r) => [r.id, r]));
    const mappingsByControl = new Map<string, MappingRow[]>();
    for (const mapping of data.mappings) {
      if (!reqById.has(mapping.requirementId)) continue;
      const rows = mappingsByControl.get(mapping.controlId) ?? [];
      rows.push(mapping);
      mappingsByControl.set(mapping.controlId, rows);
    }

    const controlsByRef = new Map<string, (typeof data.controls)[number]>();
    for (const row of data.controls) {
      const previous = controlsByRef.get(row.ref);
      const rowIsTenant = tenantId !== null && row.tenantId === tenantId;
      const previousIsTenant = tenantId !== null && previous?.tenantId === tenantId;
      if (!previous || (rowIsTenant && !previousIsTenant)) controlsByRef.set(row.ref, row);
    }

    const effectiveMappingsFor = (row: { id: string; originControlId: string | null }) => {
      const own = mappingsByControl.get(row.id) ?? [];
      if (own.length > 0) return own;
      return row.originControlId ? (mappingsByControl.get(row.originControlId) ?? []) : [];
    };

    const mappedRequirementIds = new Set<string>();
    const controlsWithMappings: Array<{
      id: string;
      ref: string;
      objective: string;
      requirementIds: Set<string>;
      frameworkIds: Set<string>;
      originControlId: string | null;
    }> = [];
    const unmappedControls: Array<{ id: string; ref: string; objective: string }> = [];

    for (const row of controlsByRef.values()) {
      const mappings = effectiveMappingsFor(row);
      const requirementIds = new Set(
        mappings.map((m) => m.requirementId).filter((id) => reqById.has(id)),
      );
      const frameworkIds = new Set(
        [...requirementIds]
          .map((id) => reqById.get(id)?.frameworkId)
          .filter((id): id is string => !!id),
      );
      for (const id of requirementIds) mappedRequirementIds.add(id);
      const item = {
        id: row.id,
        ref: row.ref,
        objective: resolveLocalized(row.objectiveI18n, locale),
        requirementIds,
        frameworkIds,
        originControlId: row.originControlId,
      };
      if (requirementIds.size === 0) {
        unmappedControls.push({ id: item.id, ref: item.ref, objective: item.objective });
      } else {
        controlsWithMappings.push(item);
      }
    }

    const byFramework = activeFrameworks
      .map((fw) => {
        const reqs = requirements.filter((r) => r.frameworkId === fw.id);
        const covered = reqs.filter((r) => mappedRequirementIds.has(r.id));
        return {
          frameworkId: fw.id,
          name: resolveLocalized(fw.nameI18n, locale),
          version: fw.version,
          total: reqs.length,
          covered: covered.length,
          percent: reqs.length === 0 ? 0 : Math.round((covered.length / reqs.length) * 100),
          uncovered: reqs
            .filter((r) => !mappedRequirementIds.has(r.id))
            .map((r) => r.ref)
            .sort()
            .slice(0, 8),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const reusableControls = controlsWithMappings
      .filter((c) => c.frameworkIds.size >= 2)
      .map((c) => ({
        id: c.id,
        ref: c.ref,
        objective: c.objective,
        frameworks: [...c.frameworkIds]
          .map((id) => frameworkById.get(id))
          .filter((fw): fw is NonNullable<typeof fw> => !!fw)
          .map((fw) => resolveLocalized(fw.nameI18n, locale))
          .sort(),
        requirements: c.requirementIds.size,
      }))
      .sort((a, b) => b.frameworks.length - a.frameworks.length || b.requirements - a.requirements)
      .slice(0, 10);
    const evidenceReuse = summarizeEvidenceReuse(
      controlsWithMappings.map((c) => ({
        id: c.id,
        originControlId: c.originControlId,
        ref: c.ref,
        requirementIds: c.requirementIds,
        frameworkIds: c.frameworkIds,
      })),
      data.evidenceLinks,
      requirements.length,
    );

    return {
      activeFrameworks: activeFrameworks.length,
      totalRequirements: requirements.length,
      coveredRequirements: mappedRequirementIds.size,
      coveragePercent:
        requirements.length === 0
          ? 0
          : Math.round((mappedRequirementIds.size / requirements.length) * 100),
      mappedControls: controlsWithMappings.length,
      reusableControls: reusableControls.length,
      unmappedControls: unmappedControls.length,
      byFramework,
      topReusableControls: reusableControls,
      evidenceReuse,
      unmappedSample: unmappedControls.sort((a, b) => a.ref.localeCompare(b.ref)).slice(0, 10),
    };
  }

  /**
   * T-V46: новая версия фреймворка — тенантная копия (tenant_id set) с новым
   * version + update notes; требования копируются, control-маппинги переносятся
   * на требования с тем же ref (tracked-changes через diff).
   */
  async newVersion(actor: Actor, sourceId: string, input: { version: string; notes?: string }) {
    const src = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [fw] = await tx
        .select()
        .from(framework)
        .where(and(eq(framework.id, sourceId), isNull(framework.deletedAt)));
      if (!fw) throw new NotFoundException(`Фреймворк ${sourceId} не найден`);
      const reqs = await tx
        .select()
        .from(frameworkRequirement)
        .where(eq(frameworkRequirement.frameworkId, sourceId));
      return { fw, reqs };
    });
    if (src.fw.version === input.version) {
      throw new BadRequestException('Новая версия должна отличаться от текущей');
    }
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(framework)
        .values({
          tenantId: actor.tenantId,
          nameI18n: src.fw.nameI18n,
          version: input.version,
          domain: src.fw.domain,
          previousVersionId: sourceId,
          updateNotes: input.notes ?? null,
        })
        .returning();
      if (!row) throw new Error('Версия фреймворка не создалась');
      // копия требований + карта ref → новый requirement.id
      const refToNewId = new Map<string, string>();
      for (const r of src.reqs) {
        const [nr] = await tx
          .insert(frameworkRequirement)
          .values({
            frameworkId: row.id,
            ref: r.ref,
            titleI18n: r.titleI18n,
            textI18n: r.textI18n,
            parentId: null,
          })
          .returning({ id: frameworkRequirement.id });
        refToNewId.set(r.ref, nr!.id);
      }
      // перенос control-маппингов: старое требование → новое с тем же ref
      const srcReqIds = src.reqs.map((r) => r.id);
      let migrated = 0;
      if (srcReqIds.length > 0) {
        const oldMappings = await tx
          .select({ controlId: controlMapping.controlId, ref: frameworkRequirement.ref })
          .from(controlMapping)
          .innerJoin(
            frameworkRequirement,
            eq(controlMapping.requirementId, frameworkRequirement.id),
          )
          .where(inArray(controlMapping.requirementId, srcReqIds));
        for (const m of oldMappings) {
          const newReqId = refToNewId.get(m.ref);
          if (!newReqId) continue;
          const [ins] = await tx
            .insert(controlMapping)
            .values({ controlId: m.controlId, requirementId: newReqId })
            .onConflictDoNothing()
            .returning({ id: controlMapping.id });
          if (ins) migrated += 1;
        }
      }
      return { id: row.id, requirements: refToNewId.size, migratedMappings: migrated };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'framework.versioned',
      entityType: 'framework',
      entityId: created.id,
      after: { version: input.version, from: sourceId, migratedMappings: created.migratedMappings },
    });
    return created;
  }

  /** T-V46: diff требований этой версии против предыдущей (added/removed/changed). */
  async diff(tenantId: string, frameworkId: string, locale: Locale) {
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const [fw] = await tx
        .select()
        .from(framework)
        .where(and(eq(framework.id, frameworkId), isNull(framework.deletedAt)));
      if (!fw) throw new NotFoundException(`Фреймворк ${frameworkId} не найден`);
      if (!fw.previousVersionId) return { fw, current: [], previous: [], prevFw: null };
      const [prevFw] = await tx
        .select()
        .from(framework)
        .where(eq(framework.id, fw.previousVersionId));
      const current = await tx
        .select()
        .from(frameworkRequirement)
        .where(eq(frameworkRequirement.frameworkId, frameworkId));
      const previous = await tx
        .select()
        .from(frameworkRequirement)
        .where(eq(frameworkRequirement.frameworkId, fw.previousVersionId));
      return { fw, current, previous, prevFw };
    });
    if (!data.fw.previousVersionId) {
      return {
        hasPrevious: false,
        updateNotes: data.fw.updateNotes,
        added: [],
        removed: [],
        changed: [],
      };
    }
    const curByRef = new Map(data.current.map((r) => [r.ref, r]));
    const prevByRef = new Map(data.previous.map((r) => [r.ref, r]));
    const added = data.current
      .filter((r) => !prevByRef.has(r.ref))
      .map((r) => ({ ref: r.ref, title: resolveLocalized(r.titleI18n, locale) }));
    const removed = data.previous
      .filter((r) => !curByRef.has(r.ref))
      .map((r) => ({ ref: r.ref, title: resolveLocalized(r.titleI18n, locale) }));
    const changed = data.current
      .filter((r) => {
        const prev = prevByRef.get(r.ref);
        return prev && prev.titleI18n.en !== r.titleI18n.en;
      })
      .map((r) => ({
        ref: r.ref,
        title: resolveLocalized(r.titleI18n, locale),
        was: resolveLocalized(prevByRef.get(r.ref)!.titleI18n, locale),
      }));
    return {
      hasPrevious: true,
      previousVersion: data.prevFw?.version ?? null,
      updateNotes: data.fw.updateNotes,
      added,
      removed,
      changed,
    };
  }

  /** T-V25: активировать фреймворк для тенанта («Add framework» в каталоге). */
  async activate(actor: Actor, frameworkId: string) {
    const [fw] = await this.dbService.db
      .select({ id: framework.id, nameI18n: framework.nameI18n })
      .from(framework)
      .where(and(eq(framework.id, frameworkId), isNull(framework.deletedAt)));
    if (!fw) throw new NotFoundException(`Фреймворк ${frameworkId} не найден`);
    const [row] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .insert(frameworkActivation)
        .values({ tenantId: actor.tenantId, frameworkId })
        .onConflictDoNothing()
        .returning(),
    );
    if (row) {
      await this.auditLogService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorIp: actor.ip,
        action: 'framework.activated',
        entityType: 'framework',
        entityId: frameworkId,
        after: { name: fw.nameI18n.en },
      });
    }
    return { frameworkId, active: true };
  }

  /** T-V25: деактивировать фреймворк (вернуть в Available). */
  async deactivate(actor: Actor, frameworkId: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .delete(frameworkActivation)
        .where(eq(frameworkActivation.frameworkId, frameworkId))
        .returning(),
    );
    if (removed.length > 0) {
      await this.auditLogService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorIp: actor.ip,
        action: 'framework.deactivated',
        entityType: 'framework',
        entityId: frameworkId,
      });
    }
    return { frameworkId, active: false };
  }

  /**
   * Читалка под нужным контекстом: с tenantSlug — под RLS тенанта (видит его
   * версии-адаптации, T-V46), иначе plain db (только глобальные строки).
   */
  private async readCtx<T>(
    tenantSlug: string | undefined,
    fn: (db: Pick<typeof this.dbService.db, 'select'>) => Promise<T>,
  ): Promise<T> {
    if (!tenantSlug) return fn(this.dbService.db);
    const [found] = await this.dbService.db
      .select({ id: tenant.id })
      .from(tenant)
      .where(eq(tenant.slug, tenantSlug));
    if (!found) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);
    return this.dbService.withTenant(found.id, fn);
  }

  /** Дерево требований фреймворка (T-078). parent_id — иерархия (клиент строит дерево). */
  async requirements(frameworkId: string, locale: Locale, tenantSlug?: string) {
    const { fw, reqs } = await this.readCtx(tenantSlug, async (db) => {
      const [fw] = await db
        .select({
          id: framework.id,
          nameI18n: framework.nameI18n,
          version: framework.version,
          domain: framework.domain,
        })
        .from(framework)
        .where(and(eq(framework.id, frameworkId), isNull(framework.deletedAt)));
      if (!fw) throw new NotFoundException(`Фреймворк ${frameworkId} не найден`);
      const reqs = await db
        .select()
        .from(frameworkRequirement)
        .where(eq(frameworkRequirement.frameworkId, frameworkId))
        .orderBy(asc(frameworkRequirement.ref));
      return { fw, reqs };
    });
    return {
      id: fw.id,
      name: resolveLocalized(fw.nameI18n, locale),
      version: fw.version,
      domain: fw.domain,
      requirements: reqs.map((r) => ({
        id: r.id,
        ref: r.ref,
        title: resolveLocalized(r.titleI18n, locale),
        parentId: r.parentId,
      })),
    };
  }

  /** Покрытие требований фреймворка замапленными контролями (T-079). Vanta-метрика framework coverage. */
  async coverage(frameworkId: string, tenantSlug?: string) {
    const { fw, reqs } = await this.readCtx(tenantSlug, async (db) => {
      const [fw] = await db
        .select({ id: framework.id, nameI18n: framework.nameI18n })
        .from(framework)
        .where(and(eq(framework.id, frameworkId), isNull(framework.deletedAt)));
      if (!fw) throw new NotFoundException(`Фреймворк ${frameworkId} не найден`);
      // requirement + признак наличия хотя бы одного маппинга контроля
      const reqs = await db
        .select({
          ref: frameworkRequirement.ref,
          mappingId: controlMapping.id,
        })
        .from(frameworkRequirement)
        .leftJoin(controlMapping, eq(controlMapping.requirementId, frameworkRequirement.id))
        .where(eq(frameworkRequirement.frameworkId, frameworkId));
      return { fw, reqs };
    });
    const covered = new Set<string>();
    const all = new Set<string>();
    for (const r of reqs) {
      all.add(r.ref);
      if (r.mappingId) covered.add(r.ref);
    }
    const total = all.size;
    const coveredCount = covered.size;
    const uncovered = [...all].filter((ref) => !covered.has(ref)).sort();
    return {
      frameworkId: fw.id,
      total,
      covered: coveredCount,
      percent: total === 0 ? 0 : Math.round((coveredCount / total) * 100),
      uncovered,
    };
  }

  /**
   * T-V25: evidence completeness — % требований, у которых хотя бы один
   * замапленный контрол имеет прикреплённый документ (document_link T-034).
   */
  async evidence(tenantId: string, frameworkId: string) {
    const [fw] = await this.dbService.db
      .select({ id: framework.id })
      .from(framework)
      .where(and(eq(framework.id, frameworkId), isNull(framework.deletedAt)));
    if (!fw) throw new NotFoundException(`Фреймворк ${frameworkId} не найден`);
    const reqs = await this.dbService.db
      .select({ ref: frameworkRequirement.ref, controlId: controlMapping.controlId })
      .from(frameworkRequirement)
      .leftJoin(controlMapping, eq(controlMapping.requirementId, frameworkRequirement.id))
      .where(eq(frameworkRequirement.frameworkId, frameworkId));
    const controlIds = [...new Set(reqs.map((r) => r.controlId).filter((c): c is string => !!c))];
    const links = controlIds.length
      ? await this.dbService.withTenant(tenantId, (tx) =>
          tx
            .selectDistinct({ entityId: documentLink.entityId })
            .from(documentLink)
            .where(
              and(
                eq(documentLink.entityType, 'control'),
                inArray(documentLink.entityId, controlIds),
              ),
            ),
        )
      : [];
    const withDoc = new Set(links.map((l) => l.entityId));
    const all = new Set<string>();
    const withEvidence = new Set<string>();
    for (const r of reqs) {
      all.add(r.ref);
      if (r.controlId && withDoc.has(r.controlId)) withEvidence.add(r.ref);
    }
    const total = all.size;
    const count = withEvidence.size;
    return {
      frameworkId,
      total,
      withEvidence: count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
      missing: [...all].filter((ref) => !withEvidence.has(ref)).sort(),
    };
  }

  /** T-V25: audit-ends — engagements тенанта, чей чеклист бьёт в контролы фреймворка. */
  async audits(tenantId: string, frameworkId: string, locale: Locale) {
    const mapped = await this.dbService.db
      .selectDistinct({ controlId: controlMapping.controlId })
      .from(controlMapping)
      .innerJoin(frameworkRequirement, eq(controlMapping.requirementId, frameworkRequirement.id))
      .where(eq(frameworkRequirement.frameworkId, frameworkId));
    const controlIds = mapped.map((m) => m.controlId);
    if (controlIds.length === 0) return [];
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .selectDistinct({
          id: engagement.id,
          titleI18n: engagement.titleI18n,
          state: engagement.state,
          items: sql<number>`count(${checklistItem.id})::int`,
        })
        .from(checklistItem)
        .innerJoin(engagement, eq(checklistItem.engagementId, engagement.id))
        .where(and(inArray(checklistItem.controlId, controlIds), isNull(engagement.deletedAt)))
        .groupBy(engagement.id, engagement.titleI18n, engagement.state),
    );
    return rows.map((r) => ({
      id: r.id,
      title: resolveLocalized(r.titleI18n, locale),
      state: r.state,
      items: r.items,
    }));
  }
}
