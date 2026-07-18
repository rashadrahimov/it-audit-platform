import { BadRequestException, Injectable } from '@nestjs/common';
import { asc, eq, isNull } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import {
  control,
  controlDomain,
  controlMapping,
  framework,
  frameworkRequirement,
  tenant,
} from '../db/schema';

export interface ControlListItem {
  id: string;
  ref: string;
  domain: { code: string; name: string } | null;
  objective: string;
  question: string;
  status: string;
  isGlobal: boolean;
  /** Маппинг на стандарты (DoD T-031: «контроль виден с его стандартами»). */
  standards: Array<{ framework: string; version: string; requirement: string }>;
}

/** Библиотека контролей (T-031, ADR-0016): глобальная + адаптации тенанта, как frameworks. */
@Injectable()
export class ControlsService {
  constructor(private readonly dbService: DbService) {}

  async list(tenantSlug: string | undefined, locale: Locale): Promise<ControlListItem[]> {
    const collect = async (db: Pick<typeof this.dbService.db, 'select'>) => {
      const controls = await db
        .select()
        .from(control)
        .where(isNull(control.deletedAt))
        .orderBy(asc(control.ref));
      const domains = await db.select().from(controlDomain);
      const mappings = await db
        .select({
          controlId: controlMapping.controlId,
          requirementRef: frameworkRequirement.ref,
          frameworkName: framework.nameI18n,
          frameworkVersion: framework.version,
        })
        .from(controlMapping)
        .innerJoin(frameworkRequirement, eq(controlMapping.requirementId, frameworkRequirement.id))
        .innerJoin(framework, eq(frameworkRequirement.frameworkId, framework.id));
      return { controls, domains, mappings };
    };

    let data;
    if (!tenantSlug) {
      data = await collect(this.dbService.db);
    } else {
      const [found] = await this.dbService.db
        .select()
        .from(tenant)
        .where(eq(tenant.slug, tenantSlug));
      if (!found) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);
      data = await this.dbService.withTenant(found.id, collect);
    }

    const domainById = new Map(data.domains.map((d) => [d.id, d]));
    return data.controls.map((row) => {
      const domain = domainById.get(row.domainId);
      return {
        id: row.id,
        ref: row.ref,
        domain: domain
          ? { code: domain.code, name: resolveLocalized(domain.nameI18n, locale) }
          : null,
        objective: resolveLocalized(row.objectiveI18n, locale),
        question: resolveLocalized(row.questionI18n, locale),
        status: row.status,
        isGlobal: row.tenantId === null,
        standards: data.mappings
          .filter((m) => m.controlId === row.id)
          .map((m) => ({
            framework: resolveLocalized(m.frameworkName, locale),
            version: m.frameworkVersion,
            requirement: m.requirementRef,
          })),
      };
    });
  }
}
