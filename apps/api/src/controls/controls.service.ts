import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import {
  auditLog,
  comment,
  control,
  controlDomain,
  controlMapping,
  framework,
  frameworkRequirement,
  membership,
  tenant,
  user,
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

export interface ControlDetail extends ControlListItem {
  guidance: string | null;
  /** ref глобального оригинала — признак тенантской адаптации (ADR-0016). */
  originControlId: string | null;
  owner: { fullName: string; email: string } | null;
  history: Array<{ action: string; actor: string | null; at: string }>;
  comments: Array<{ author: string; body: string; at: string }>;
}

/** Библиотека контролей (T-031, T-032, ADR-0016): глобальная + адаптации тенанта. */
@Injectable()
export class ControlsService {
  constructor(private readonly dbService: DbService) {}

  /** Карточка контроля (T-032): поля + owner + стандарты + history + comments одним ответом. */
  async detail(id: string, tenantSlug: string | undefined, locale: Locale): Promise<ControlDetail> {
    const collect = async (db: Pick<typeof this.dbService.db, 'select'>) => {
      const [row] = await db
        .select()
        .from(control)
        .where(and(eq(control.id, id), isNull(control.deletedAt)));
      if (!row) throw new NotFoundException(`Контроль ${id} не найден`);
      const [domain] = await db
        .select()
        .from(controlDomain)
        .where(eq(controlDomain.id, row.domainId));
      // адаптация без собственных маппингов наследует маппинги оригинала (ADR-0016)
      const mappingSources = [row.id, row.originControlId].filter((x): x is string => x !== null);
      const mappings = await db
        .select({
          controlId: controlMapping.controlId,
          requirementRef: frameworkRequirement.ref,
          frameworkName: framework.nameI18n,
          frameworkVersion: framework.version,
        })
        .from(controlMapping)
        .innerJoin(frameworkRequirement, eq(controlMapping.requirementId, frameworkRequirement.id))
        .innerJoin(framework, eq(frameworkRequirement.frameworkId, framework.id))
        .where(inArray(controlMapping.controlId, mappingSources));
      const ownMappings = mappings.filter((m) => m.controlId === row.id);
      const effectiveMappings = ownMappings.length > 0 ? ownMappings : mappings;
      const owner = row.ownerMembershipId
        ? await db
            .select({ fullName: user.fullName, email: user.email })
            .from(membership)
            .innerJoin(user, eq(membership.userId, user.id))
            .where(eq(membership.id, row.ownerMembershipId))
            .then((r) => r[0] ?? null)
        : null;
      // журналы под RLS тенанта: у глобального контроля без контекста будут пусты — это норма
      const history = await db
        .select({ action: auditLog.action, actorUserId: auditLog.actorUserId, at: auditLog.at })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'control'), eq(auditLog.entityId, row.id)))
        .orderBy(desc(auditLog.at));
      const comments = await db
        .select({ body: comment.body, at: comment.createdAt, author: user.fullName })
        .from(comment)
        .innerJoin(user, eq(comment.authorUserId, user.id))
        .where(
          and(
            eq(comment.entityType, 'control'),
            eq(comment.entityId, row.id),
            isNull(comment.deletedAt),
          ),
        )
        .orderBy(asc(comment.createdAt));
      return { row, domain, mappings: effectiveMappings, owner, history, comments };
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

    const actorIds = [...new Set(data.history.map((h) => h.actorUserId).filter(Boolean))];
    const actors = actorIds.length
      ? await this.dbService.db
          .select()
          .from(user)
          .where(inArray(user.id, actorIds as string[]))
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a.fullName]));

    return {
      id: data.row.id,
      ref: data.row.ref,
      domain: data.domain
        ? { code: data.domain.code, name: resolveLocalized(data.domain.nameI18n, locale) }
        : null,
      objective: resolveLocalized(data.row.objectiveI18n, locale),
      question: resolveLocalized(data.row.questionI18n, locale),
      guidance: data.row.guidanceI18n ? resolveLocalized(data.row.guidanceI18n, locale) : null,
      status: data.row.status,
      isGlobal: data.row.tenantId === null,
      originControlId: data.row.originControlId,
      owner: data.owner,
      standards: data.mappings.map((m) => ({
        framework: resolveLocalized(m.frameworkName, locale),
        version: m.frameworkVersion,
        requirement: m.requirementRef,
      })),
      history: data.history.map((h) => ({
        action: h.action,
        actor: h.actorUserId ? (actorById.get(h.actorUserId) ?? null) : null,
        at: h.at.toISOString(),
      })),
      comments: data.comments.map((c) => ({
        author: c.author,
        body: c.body,
        at: c.at.toISOString(),
      })),
    };
  }

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
        standards: standardsFor(row, data.mappings).map((m) => ({
          framework: resolveLocalized(m.frameworkName, locale),
          version: m.frameworkVersion,
          requirement: m.requirementRef,
        })),
      };
    });
  }
}

interface MappingRow {
  controlId: string;
  requirementRef: string;
  frameworkName: I18nText;
  frameworkVersion: string;
}

/** Свои маппинги контроля; у адаптации без своих — наследуются от оригинала (ADR-0016). */
function standardsFor(
  row: { id: string; originControlId: string | null },
  mappings: MappingRow[],
): MappingRow[] {
  const own = mappings.filter((m) => m.controlId === row.id);
  if (own.length > 0) return own;
  return row.originControlId ? mappings.filter((m) => m.controlId === row.originControlId) : [];
}
