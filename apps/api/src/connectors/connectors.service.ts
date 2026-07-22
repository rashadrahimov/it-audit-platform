import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { connector, syncRun, test as controlTest, testResult } from '../db/schema';
import { decryptConfig, encryptConfig } from './config-crypto';
import { ConnectorSyncService } from './connector-sync.service';
import { AUTO_TEST_RUN_EVERY_MS, CONNECTOR_AUTOSYNC_EVERY_MS } from '../jobs/jobs.constants';
import { clampSyncInterval, isDue, mergeConfig } from './connector-schedule';
import { buildMonitoringInsights } from './monitoring-insights';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface CreateConnectorInput {
  provider: string;
  capabilities: string[];
  config: Record<string, unknown>;
}

export interface UpdateConnectorInput {
  capabilities?: string[];
  /** Частичное обновление конфига: переданные ключи мержатся в текущий (пустые — игнор). */
  config?: Record<string, unknown>;
  status?: 'active' | 'disabled';
  /** Интервал автосинка (мин): null/0 = ручной; иначе клампится [5, 44640]. */
  syncIntervalMinutes?: number | null;
}

/**
 * Известные capability коннектора (ADR-0011). T-V39: + discovery (авто-обнаружение
 * вендоров) и code (изменения кода из VCS) — новые категории провайдеров.
 */
export const CAPABILITIES = [
  'access',
  'inventory',
  'personnel',
  'evidence',
  'vulns',
  'tasks',
  'tickets',
  'cloud',
  'logs',
  'discovery',
  'code',
];

/** Коннекторы (T-048, ADR-0011): CRUD + история sync_run. Конфиг наружу не отдаётся. */
@Injectable()
export class ConnectorsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly syncService: ConnectorSyncService,
  ) {}

  async create(actor: Actor, input: CreateConnectorInput) {
    if (this.syncService.providerCapabilities(input.provider) === null) {
      throw new BadRequestException(`Провайдер «${input.provider}» отсутствует в каталоге`);
    }
    const unknown = input.capabilities.filter((c) => !CAPABILITIES.includes(c));
    if (unknown.length > 0) {
      throw new BadRequestException(`Неизвестные capabilities: ${unknown.join(', ')}`);
    }
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(connector)
        .values({
          tenantId: actor.tenantId,
          provider: input.provider,
          capabilities: input.capabilities,
          configEncrypted: encryptConfig(input.config),
        })
        .returning();
      if (!row) throw new Error('Коннектор не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'connector.created',
      entityType: 'connector',
      entityId: created.id,
      // конфиг (креды) в журнал НЕ пишем — только провайдер и capabilities
      after: { provider: created.provider, capabilities: created.capabilities },
    });
    return this.toPublic(created);
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(isNull(connector.deletedAt))
        .orderBy(desc(connector.createdAt)),
    );
    return rows.map((r) => this.toPublic(r));
  }

  async detail(tenantId: string, id: string) {
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, id), isNull(connector.deletedAt)));
      if (!row) throw new NotFoundException(`Коннектор ${id} не найден`);
      const runs = await tx
        .select()
        .from(syncRun)
        .where(eq(syncRun.connectorId, id))
        .orderBy(desc(syncRun.startedAt))
        .limit(10);
      return { row, runs };
    });
    return {
      ...this.toPublic(data.row),
      syncRuns: data.runs.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        outcome: r.outcome,
        stats: r.stats,
        error: r.error,
      })),
    };
  }

  /** T-H43: read-only контур continuous monitoring/rescan по коннекторам и автотестам. */
  async monitoringSummary(tenantId: string) {
    const now = new Date();
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const connectors = await tx
        .select()
        .from(connector)
        .where(isNull(connector.deletedAt))
        .orderBy(desc(connector.createdAt));

      const connectorIds = connectors.map((c) => c.id);
      const runs =
        connectorIds.length > 0
          ? await tx
              .select()
              .from(syncRun)
              .where(inArray(syncRun.connectorId, connectorIds))
              .orderBy(desc(syncRun.startedAt))
              .limit(50)
          : [];

      const automatedTests = await tx
        .select()
        .from(controlTest)
        .where(and(eq(controlTest.kind, 'automated'), isNull(controlTest.deletedAt)));

      const automatedTestIds = automatedTests.map((t) => t.id);
      const testRuns =
        automatedTestIds.length > 0
          ? await tx
              .select()
              .from(testResult)
              .where(inArray(testResult.testId, automatedTestIds))
              .orderBy(desc(testResult.runAt))
              .limit(50)
          : [];

      return { connectors, runs, automatedTests, testRuns };
    });

    const latestRunByConnector = new Map<string, (typeof data.runs)[number]>();
    for (const run of data.runs) {
      if (!latestRunByConnector.has(run.connectorId))
        latestRunByConnector.set(run.connectorId, run);
    }

    const scheduled = data.connectors.filter(
      (c) => c.status !== 'disabled' && c.syncIntervalMinutes !== null,
    );
    const dueForSync = scheduled.filter((c) => isDue(c.lastSyncAt, c.syncIntervalMinutes, now));
    const errorConnectors = data.connectors.filter((c) => {
      const latest = latestRunByConnector.get(c.id);
      return c.status === 'error' || latest?.outcome === 'error';
    });
    const activeConnectors = data.connectors.filter((c) => c.status === 'active');
    const lastSyncAt = data.connectors
      .map((c) => c.lastSyncAt)
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const lastAutoTestAt = data.testRuns
      .map((r) => r.runAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const failingAutomatedTests = data.automatedTests.filter((t) =>
      ['failing', 'needs_attention'].includes(t.status),
    );
    const scheduler = {
      connectorAutosyncEveryMinutes: Math.round(CONNECTOR_AUTOSYNC_EVERY_MS / 60_000),
      autoTestRunEveryMinutes: Math.round(AUTO_TEST_RUN_EVERY_MS / 60_000),
    };
    const counts = {
      connectors: data.connectors.length,
      activeConnectors: activeConnectors.length,
      scheduledConnectors: scheduled.length,
      dueForSync: dueForSync.length,
      errorConnectors: errorConnectors.length,
      automatedTests: data.automatedTests.length,
      failingAutomatedTests: failingAutomatedTests.length,
    };

    return {
      generatedAt: now.toISOString(),
      scheduler,
      counts,
      insights: buildMonitoringInsights(counts, scheduler),
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      lastAutoTestAt: lastAutoTestAt?.toISOString() ?? null,
      connectors: data.connectors.map((c) => {
        const latest = latestRunByConnector.get(c.id);
        return {
          id: c.id,
          provider: c.provider,
          status: c.status,
          capabilities: c.capabilities,
          syncIntervalMinutes: c.syncIntervalMinutes ?? null,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          lastOutcome: latest?.outcome ?? null,
          lastError: latest?.error ?? null,
          dueForSync: c.status !== 'disabled' && isDue(c.lastSyncAt, c.syncIntervalMinutes, now),
        };
      }),
      recentRuns: data.runs.slice(0, 5).map((r) => ({
        id: r.id,
        connectorId: r.connectorId,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        outcome: r.outcome,
        stats: r.stats,
        error: r.error,
      })),
      failingAutomatedTests: failingAutomatedTests.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.titleI18n,
        status: t.status,
        slaStatus: t.slaStatus,
        dueDate: t.dueDate?.toISOString() ?? null,
      })),
    };
  }

  /** T-V38: частичное обновление коннектора — capabilities/config/статус/расписание. */
  async update(actor: Actor, id: string, input: UpdateConnectorInput) {
    if (input.capabilities) {
      const unknown = input.capabilities.filter((c) => !CAPABILITIES.includes(c));
      if (unknown.length > 0) {
        throw new BadRequestException(`Неизвестные capabilities: ${unknown.join(', ')}`);
      }
    }
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, id), isNull(connector.deletedAt)));
      if (!row) throw new NotFoundException(`Коннектор ${id} не найден`);

      const patch: Partial<typeof connector.$inferInsert> = {};
      if (input.capabilities) patch.capabilities = input.capabilities;
      if (input.status) patch.status = input.status;
      if (input.syncIntervalMinutes !== undefined) {
        patch.syncIntervalMinutes = clampSyncInterval(input.syncIntervalMinutes);
      }
      if (input.config && Object.keys(input.config).length > 0) {
        const existing = row.configEncrypted ? decryptConfig(row.configEncrypted) : {};
        patch.configEncrypted = encryptConfig(mergeConfig(existing, input.config));
      }
      if (Object.keys(patch).length === 0) return row;
      const [next] = await tx.update(connector).set(patch).where(eq(connector.id, id)).returning();
      return next ?? row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'connector.updated',
      entityType: 'connector',
      entityId: id,
      // секреты в журнал не пишем — только несекретные изменённые поля
      after: {
        capabilities: input.capabilities,
        status: input.status,
        syncIntervalMinutes: input.syncIntervalMinutes,
        configChanged: input.config ? Object.keys(input.config) : undefined,
      },
    });
    return this.toPublic(updated);
  }

  async remove(actor: Actor, id: string) {
    const removed = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .update(connector)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(connector.id, id), isNull(connector.deletedAt)))
        .returning();
      return row;
    });
    if (!removed) throw new NotFoundException(`Коннектор ${id} не найден или уже удалён`);
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'connector.deleted',
      entityType: 'connector',
      entityId: id,
    });
  }

  /** Наружу — без config_encrypted (секрет не покидает сервер). */
  private toPublic(row: typeof connector.$inferSelect) {
    return {
      id: row.id,
      provider: row.provider,
      capabilities: row.capabilities,
      status: row.status,
      hasConfig: row.configEncrypted !== null,
      syncIntervalMinutes: row.syncIntervalMinutes ?? null,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    };
  }
}
