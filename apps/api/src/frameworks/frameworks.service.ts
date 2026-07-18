import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { controlMapping, framework, frameworkRequirement, tenant } from '../db/schema';

export interface FrameworkListItem {
  id: string;
  name: string;
  nameI18n: { en: string; az?: string; ru?: string };
  version: string;
  status: string;
  /** true — глобальная библиотека (ADR-0016), false — адаптация тенанта. */
  isGlobal: boolean;
  sourceFrameworkId: string | null;
}

/**
 * Библиотека стандартов (T-030, ADR-0016). Без тенант-контекста RLS отдаёт
 * только глобальные строки; с tenantSlug — плюс адаптации тенанта.
 */
@Injectable()
export class FrameworksService {
  constructor(private readonly dbService: DbService) {}

  async list(tenantSlug: string | undefined, locale: Locale): Promise<FrameworkListItem[]> {
    const collect = (db: Pick<typeof this.dbService.db, 'select'>) =>
      db
        .select()
        .from(framework)
        .where(isNull(framework.deletedAt))
        .orderBy(asc(framework.createdAt));

    let rows;
    if (!tenantSlug) {
      rows = await collect(this.dbService.db);
    } else {
      const [found] = await this.dbService.db
        .select()
        .from(tenant)
        .where(eq(tenant.slug, tenantSlug));
      if (!found) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);
      rows = await this.dbService.withTenant(found.id, collect);
    }

    return rows.map((row) => ({
      id: row.id,
      name: resolveLocalized(row.nameI18n, locale),
      nameI18n: row.nameI18n,
      version: row.version,
      status: row.status,
      isGlobal: row.tenantId === null,
      sourceFrameworkId: row.sourceFrameworkId,
    }));
  }

  /** Дерево требований фреймворка (T-078). parent_id — иерархия (клиент строит дерево). */
  async requirements(frameworkId: string, locale: Locale) {
    const [fw] = await this.dbService.db
      .select({ id: framework.id, nameI18n: framework.nameI18n, version: framework.version })
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
}
