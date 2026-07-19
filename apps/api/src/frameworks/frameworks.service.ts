import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  checklistItem,
  controlMapping,
  documentLink,
  engagement,
  framework,
  frameworkActivation,
  frameworkRequirement,
  tenant,
} from '../db/schema';

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
    }));
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

  /** Дерево требований фреймворка (T-078). parent_id — иерархия (клиент строит дерево). */
  async requirements(frameworkId: string, locale: Locale) {
    const [fw] = await this.dbService.db
      .select({
        id: framework.id,
        nameI18n: framework.nameI18n,
        version: framework.version,
        domain: framework.domain,
      })
      .from(framework)
      .where(and(eq(framework.id, frameworkId), isNull(framework.deletedAt)));
    if (!fw) throw new NotFoundException(`Фреймворк ${frameworkId} не найден`);
    const reqs = await this.dbService.db
      .select()
      .from(frameworkRequirement)
      .where(eq(frameworkRequirement.frameworkId, frameworkId))
      .orderBy(asc(frameworkRequirement.ref));
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
  async coverage(frameworkId: string) {
    const [fw] = await this.dbService.db
      .select({ id: framework.id, nameI18n: framework.nameI18n })
      .from(framework)
      .where(and(eq(framework.id, frameworkId), isNull(framework.deletedAt)));
    if (!fw) throw new NotFoundException(`Фреймворк ${frameworkId} не найден`);
    // requirement + признак наличия хотя бы одного маппинга контроля
    const reqs = await this.dbService.db
      .select({
        ref: frameworkRequirement.ref,
        mappingId: controlMapping.id,
      })
      .from(frameworkRequirement)
      .leftJoin(controlMapping, eq(controlMapping.requirementId, frameworkRequirement.id))
      .where(eq(frameworkRequirement.frameworkId, frameworkId));
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
