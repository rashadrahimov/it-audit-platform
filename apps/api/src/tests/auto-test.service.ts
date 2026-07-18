import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { ConnectorSyncService } from '../connectors/connector-sync.service';
import { DbService } from '../db/db.service';
import { tenant, test } from '../db/schema';
import { TestsService } from './tests.service';

interface Actor {
  tenantId: string;
  userId: string | null;
  ip?: string;
}

/**
 * Правило автопроверки (T-050) в test.check_config. Пока один тип: field_present —
 * запись «провалила», если у неё нет непустого поля. Расширяется под новые capability.
 */
interface FieldPresentRule {
  type: 'field_present';
  field: string;
}

/**
 * Автотесты через коннектор (T-050, замыкает continuous-loop ADR-0010/0011):
 * коннектор → записи → правило check_config → test_result (pass/fail + failing_entities)
 * → статус теста (через TestsService.recordResult).
 */
@Injectable()
export class AutoTestService {
  constructor(
    private readonly dbService: DbService,
    private readonly connectorSyncService: ConnectorSyncService,
    private readonly testsService: TestsService,
  ) {}

  /** Прогнать один автотест: дёрнуть коннектор, применить правило, записать результат. */
  async run(actor: Actor, testId: string) {
    const [row] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(test)
        .where(and(eq(test.id, testId), isNull(test.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Тест ${testId} не найден`);
    if (!row.connectorId)
      throw new BadRequestException('У теста нет коннектора (не автоматический)');
    const rule = this.parseRule(row.checkConfig);

    try {
      const { records } = await this.connectorSyncService.collectRecords(
        actor.tenantId,
        row.connectorId,
      );
      const failing = records.filter((r) => {
        const v = r[rule.field];
        return v === undefined || v === null || v === '';
      });
      return this.testsService.recordResult(actor, testId, {
        outcome: failing.length === 0 ? 'pass' : 'fail',
        failingEntities: failing,
        details: { checked: records.length, failed: failing.length, rule },
      });
    } catch (error) {
      // сбой коннектора → тест needs_attention (error), не падение (ADR-0011)
      return this.testsService.recordResult(actor, testId, {
        outcome: 'error',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  /** Прогнать все автотесты тенанта (для repeatable-джобы). */
  async runAllForTenant(tenantId: string): Promise<{ ran: number }> {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ id: test.id })
        .from(test)
        .where(
          and(isNull(test.deletedAt), isNotNull(test.connectorId), eq(test.kind, 'automated')),
        ),
    );
    for (const row of rows) {
      await this.run({ tenantId, userId: null }, row.id).catch(() => undefined);
    }
    return { ran: rows.length };
  }

  /** Все автотесты всех тенантов (repeatable-джоба T-050): обход как SlaService. */
  async runAll(): Promise<{ ran: number }> {
    const tenants = await this.dbService.db.select({ id: tenant.id }).from(tenant);
    let ran = 0;
    for (const t of tenants) {
      const result = await this.runAllForTenant(t.id);
      ran += result.ran;
    }
    return { ran };
  }

  private parseRule(checkConfig: unknown): FieldPresentRule {
    if (
      checkConfig &&
      typeof checkConfig === 'object' &&
      (checkConfig as FieldPresentRule).type === 'field_present' &&
      typeof (checkConfig as FieldPresentRule).field === 'string'
    ) {
      return checkConfig as FieldPresentRule;
    }
    throw new BadRequestException('check_config: ожидается {type:"field_present", field:"…"}');
  }
}
