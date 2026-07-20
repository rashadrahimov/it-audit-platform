import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { connector, syncRun } from '../db/schema';
import { decryptConfig, encryptConfig } from './config-crypto';
import { ConnectorSyncService } from './connector-sync.service';
import { clampSyncInterval, mergeConfig } from './connector-schedule';

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

/** Известные capability коннектора (ADR-0011). */
export const CAPABILITIES = ['access', 'inventory', 'personnel', 'evidence', 'vulns', 'tasks'];

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
