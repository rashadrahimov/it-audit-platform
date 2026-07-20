import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
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
  test as testTable,
  user,
} from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface ControlListItem {
  id: string;
  ref: string;
  domain: { code: string; name: string } | null;
  objective: string;
  question: string;
  status: string;
  isGlobal: boolean;
  /** T-V45: назначенный владелец (в тенант-контексте). */
  owner: string | null;
  /** T-V45: счётчики тестов контроля (passing = status ok). */
  testCount: number;
  passingCount: number;
  /** Маппинг на стандарты (DoD T-031: «контроль виден с его стандартами»). */
  standards: Array<{ framework: string; version: string; requirement: string }>;
}

export interface ControlDetail extends ControlListItem {
  guidance: string | null;
  note: string | null;
  /** ref глобального оригинала — признак тенантской адаптации (ADR-0016). */
  originControlId: string | null;
  ownerMembershipId: string | null;
  ownerDetail: { fullName: string; email: string } | null;
  history: Array<{ action: string; actor: string | null; at: string }>;
  comments: Array<{ author: string; body: string; at: string }>;
}

/** Библиотека контролей (T-031, T-032, ADR-0016): глобальная + адаптации тенанта. */
@Injectable()
export class ControlsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
      // T-V45: счётчики тестов контроля (в тенант-контексте пусты для чистого global)
      const tests = await db
        .select({ status: testTable.status })
        .from(testTable)
        .where(and(eq(testTable.controlId, row.id), isNull(testTable.deletedAt)));
      return { row, domain, mappings: effectiveMappings, owner, history, comments, tests };
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
      note: (data.row.custom as Record<string, unknown>)?.note
        ? String((data.row.custom as Record<string, unknown>).note)
        : null,
      status: data.row.status,
      isGlobal: data.row.tenantId === null,
      originControlId: data.row.originControlId,
      ownerMembershipId: data.row.ownerMembershipId,
      owner: data.owner?.fullName ?? null,
      ownerDetail: data.owner,
      testCount: data.tests.length,
      passingCount: data.tests.filter((t) => t.status === 'ok').length,
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

  async list(
    tenantSlug: string | undefined,
    locale: Locale,
    filters?: { domainCode?: string; q?: string },
  ): Promise<ControlListItem[]> {
    const collect = async (db: Pick<typeof this.dbService.db, 'select'>) => {
      const controls = await db
        .select({
          id: control.id,
          ref: control.ref,
          tenantId: control.tenantId,
          originControlId: control.originControlId,
          domainId: control.domainId,
          objectiveI18n: control.objectiveI18n,
          questionI18n: control.questionI18n,
          status: control.status,
          ownerName: user.fullName,
        })
        .from(control)
        .leftJoin(membership, eq(control.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
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
      // T-V45: счётчики тестов по контролю (тенант-контекст)
      const testRows = await db
        .select({ controlId: testTable.controlId, status: testTable.status })
        .from(testTable)
        .where(isNull(testTable.deletedAt));
      return { controls, domains, mappings, testRows };
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
    const testsByControl = new Map<string, { total: number; passing: number }>();
    for (const tr of data.testRows) {
      const acc = testsByControl.get(tr.controlId) ?? { total: 0, passing: 0 };
      acc.total += 1;
      if (tr.status === 'ok') acc.passing += 1;
      testsByControl.set(tr.controlId, acc);
    }
    const items = data.controls.map((row) => {
      const domain = domainById.get(row.domainId);
      const tests = testsByControl.get(row.id) ?? { total: 0, passing: 0 };
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
        owner: row.ownerName,
        testCount: tests.total,
        passingCount: tests.passing,
        standards: standardsFor(row, data.mappings).map((m) => ({
          framework: resolveLocalized(m.frameworkName, locale),
          version: m.frameworkVersion,
          requirement: m.requirementRef,
        })),
      };
    });
    // T-V16: библиотека собирается в памяти (global+tenant) — фильтруем здесь же
    const needle = filters?.q?.toLowerCase();
    return items.filter(
      (c) =>
        (!filters?.domainCode || c.domain?.code === filters.domainCode) &&
        (!needle ||
          c.ref.toLowerCase().includes(needle) ||
          c.objective.toLowerCase().includes(needle)),
    );
  }

  /** T-V45: сводка назначений и % контролей с passing-тестами (дедуп по ref: адаптация > global). */
  async summary(tenantSlug: string, locale: Locale) {
    const items = await this.list(tenantSlug, locale);
    // дедуп по ref — тенантная адаптация (не global) перекрывает глобальный оригинал
    const byRef = new Map<string, (typeof items)[number]>();
    for (const c of items) {
      const prev = byRef.get(c.ref);
      if (!prev || (prev.isGlobal && !c.isGlobal)) byRef.set(c.ref, c);
    }
    const deduped = [...byRef.values()];
    const total = deduped.length;
    const assigned = deduped.filter((c) => c.owner).length;
    const withPassing = deduped.filter((c) => c.passingCount > 0).length;
    return {
      total,
      assigned,
      unassigned: total - assigned,
      withPassingEvidence: withPassing,
      percentPassing: total === 0 ? 0 : Math.round((withPassing / total) * 100),
    };
  }

  /**
   * T-V45: назначить owner/статус/заметку. Тенантный контроль правится напрямую;
   * глобальный — через тенантную адаптацию (ADR-0016 global+override).
   */
  async update(
    actor: Actor,
    id: string,
    input: { ownerMembershipId?: string | null; status?: string; note?: string | null },
  ) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(control)
        .where(and(eq(control.id, id), isNull(control.deletedAt)));
      if (!row) throw new NotFoundException(`Контроль ${id} не найден`);
      if (input.ownerMembershipId) {
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(
              eq(membership.id, input.ownerMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!m) throw new BadRequestException('ownerMembershipId: участник не найден в тенанте');
      }
      const applyFields = (custom: Record<string, unknown>) => {
        const patch: Record<string, unknown> = {};
        if (input.ownerMembershipId !== undefined)
          patch.ownerMembershipId = input.ownerMembershipId;
        if (input.status !== undefined) patch.status = input.status;
        if (input.note !== undefined) {
          patch.custom = { ...custom, note: input.note ?? undefined };
        }
        return patch;
      };

      if (row.tenantId === actor.tenantId) {
        const patch = applyFields((row.custom as Record<string, unknown>) ?? {});
        const [res] = await tx.update(control).set(patch).where(eq(control.id, id)).returning();
        return { id: res!.id, adapted: false };
      }
      // глобальный → адаптация: существующая для ref или новая
      const [existing] = await tx
        .select()
        .from(control)
        .where(
          and(
            eq(control.tenantId, actor.tenantId),
            eq(control.ref, row.ref),
            isNull(control.deletedAt),
          ),
        );
      if (existing) {
        const patch = applyFields((existing.custom as Record<string, unknown>) ?? {});
        const [res] = await tx
          .update(control)
          .set(patch)
          .where(eq(control.id, existing.id))
          .returning();
        return { id: res!.id, adapted: false };
      }
      const patch = applyFields({});
      const [adapted] = await tx
        .insert(control)
        .values({
          tenantId: actor.tenantId,
          originControlId: row.id,
          ref: row.ref,
          domainId: row.domainId,
          objectiveI18n: row.objectiveI18n,
          questionI18n: row.questionI18n,
          guidanceI18n: row.guidanceI18n,
          ownerMembershipId: (patch.ownerMembershipId as string | null) ?? null,
          status: (patch.status as string) ?? row.status,
          custom: (patch.custom as Record<string, unknown>) ?? {},
        })
        .returning();
      return { id: adapted!.id, adapted: true };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: result.adapted ? 'control.adapted' : 'control.updated',
      entityType: 'control',
      entityId: result.id,
      after: {
        ownerMembershipId: input.ownerMembershipId ?? null,
        status: input.status ?? null,
      },
    });
    return result;
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
