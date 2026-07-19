import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { control, document, membership, test, testResult, user } from '../db/schema';

interface Actor {
  tenantId: string;
  /** null = системный прогон (repeatable-джоба автотестов, T-050). */
  userId: string | null;
  ip?: string;
}

export interface CreateTestInput {
  controlId: string;
  titleI18n: I18nText;
  kind: 'manual' | 'automated';
  frequency?: string;
  dueDate?: string;
  ownerMembershipId?: string;
  /** T-050: коннектор-источник + правило автопроверки (для kind=automated). */
  connectorId?: string;
  checkConfig?: Record<string, unknown>;
}

export interface RecordResultInput {
  outcome: 'pass' | 'fail' | 'error';
  failingEntities?: unknown[];
  evidenceDocumentId?: string;
  details?: Record<string, unknown>;
}

/** Outcome прогона → статус теста (ADR-0010). */
const STATUS_BY_OUTCOME: Record<RecordResultInput['outcome'], string> = {
  pass: 'ok',
  fail: 'failing',
  error: 'needs_attention',
};

/** Tests-слой (T-033, ADR-0010): проверки контролей; автотесты придут с EP-INT. */
@Injectable()
export class TestsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(actor: Actor, input: CreateTestInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [ctrl] = await tx
        .select()
        .from(control)
        .where(and(eq(control.id, input.controlId), isNull(control.deletedAt)));
      if (!ctrl) throw new BadRequestException(`Контроль ${input.controlId} не найден`);
      if (input.ownerMembershipId) {
        const [owner] = await tx
          .select()
          .from(membership)
          .where(
            and(
              eq(membership.id, input.ownerMembershipId),
              eq(membership.tenantId, actor.tenantId),
            ),
          );
        if (!owner) throw new BadRequestException('owner: membership не найден в тенанте');
      }
      const [row] = await tx
        .insert(test)
        .values({
          tenantId: actor.tenantId,
          controlId: input.controlId,
          titleI18n: input.titleI18n,
          kind: input.kind,
          frequency: input.frequency ?? null,
          connectorId: input.connectorId ?? null,
          checkConfig: input.checkConfig ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          ownerMembershipId: input.ownerMembershipId ?? null,
        })
        .returning();
      if (!row) throw new Error('Тест не создался');
      return { row, controlRef: ctrl.ref };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'test.created',
      entityType: 'test',
      entityId: created.row.id,
      after: { title: created.row.titleI18n.en, control: created.controlRef },
    });
    return created.row;
  }

  /** Прогон: результат пишется в историю, статус теста пересчитывается по outcome. */
  async recordResult(actor: Actor, testId: string, input: RecordResultInput) {
    const saved = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(test)
        .where(and(eq(test.id, testId), isNull(test.deletedAt)));
      if (!row) throw new NotFoundException(`Тест ${testId} не найден`);
      if (row.status === 'deactivated') {
        throw new BadRequestException('Тест деактивирован — прогоны не принимаются');
      }
      if (input.evidenceDocumentId) {
        const [doc] = await tx
          .select()
          .from(document)
          .where(and(eq(document.id, input.evidenceDocumentId), isNull(document.deletedAt)));
        if (!doc) throw new BadRequestException('evidenceDocumentId: документ не найден');
      }
      const [result] = await tx
        .insert(testResult)
        .values({
          testId,
          outcome: input.outcome,
          failingEntities: input.failingEntities ?? [],
          evidenceDocumentId: input.evidenceDocumentId ?? null,
          details: input.details ?? {},
        })
        .returning();
      const [updated] = await tx
        .update(test)
        .set({ status: STATUS_BY_OUTCOME[input.outcome] })
        .where(eq(test.id, testId))
        .returning();
      return { result, before: row.status, after: updated?.status };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'test.result_recorded',
      entityType: 'test',
      entityId: testId,
      before: { status: saved.before },
      after: { status: saved.after, outcome: input.outcome },
    });
    return saved.result;
  }

  async list(
    tenantId: string,
    locale: Locale,
    controlId?: string,
    filters?: { status?: string; kind?: string; slaStatus?: string; ownerMembershipId?: string },
  ) {
    const conds = [isNull(test.deletedAt)];
    if (controlId) conds.push(eq(test.controlId, controlId));
    if (filters?.status) conds.push(eq(test.status, filters.status));
    if (filters?.kind) conds.push(eq(test.kind, filters.kind));
    if (filters?.slaStatus) conds.push(eq(test.slaStatus, filters.slaStatus));
    if (filters?.ownerMembershipId) {
      conds.push(eq(test.ownerMembershipId, filters.ownerMembershipId));
    }
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: test.id,
          titleI18n: test.titleI18n,
          kind: test.kind,
          frequency: test.frequency,
          status: test.status,
          slaStatus: test.slaStatus,
          dueDate: test.dueDate,
          controlRef: control.ref,
          controlId: test.controlId,
          owner: user.fullName,
        })
        .from(test)
        .innerJoin(control, eq(test.controlId, control.id))
        .leftJoin(membership, eq(test.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(...conds))
        .orderBy(desc(test.createdAt)),
    );
    return rows.map((row) => ({
      id: row.id,
      title: resolveLocalized(row.titleI18n, locale),
      kind: row.kind,
      frequency: row.frequency,
      status: row.status,
      slaStatus: row.slaStatus,
      dueDate: row.dueDate?.toISOString() ?? null,
      controlRef: row.controlRef,
      controlId: row.controlId,
      owner: row.owner,
    }));
  }

  async detail(tenantId: string, id: string, locale: Locale) {
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(test)
        .where(and(eq(test.id, id), isNull(test.deletedAt)));
      if (!row) throw new NotFoundException(`Тест ${id} не найден`);
      const results = await tx
        .select()
        .from(testResult)
        .where(eq(testResult.testId, id))
        .orderBy(desc(testResult.runAt))
        .limit(20);
      return { row, results };
    });
    return {
      id: data.row.id,
      title: resolveLocalized(data.row.titleI18n, locale),
      kind: data.row.kind,
      status: data.row.status,
      slaStatus: data.row.slaStatus,
      dueDate: data.row.dueDate?.toISOString() ?? null,
      controlId: data.row.controlId,
      results: data.results.map((r) => ({
        runAt: r.runAt.toISOString(),
        outcome: r.outcome,
        failingEntities: r.failingEntities,
        evidenceDocumentId: r.evidenceDocumentId,
      })),
    };
  }
}
