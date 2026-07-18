import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { connector, syncRun } from '../db/schema';
import { decryptConfig } from './config-crypto';
import type { ConnectorProvider, SyncResult } from './connector-provider';
import { LdapConnectorProvider } from './providers/ldap.provider';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/**
 * Запуск синхронизации коннектора (T-049, ADR-0011): выбирает провайдера по
 * connector.provider, выполняет sync, пишет sync_run. Сбой провайдера/конфига
 * фиксируется как outcome=error — платформа не падает (отключается авто-заполнение).
 */
@Injectable()
export class ConnectorSyncService {
  private readonly providers = new Map<string, ConnectorProvider>();

  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    ldap: LdapConnectorProvider,
  ) {
    for (const p of [ldap]) this.providers.set(p.provider, p);
  }

  async run(actor: Actor, connectorId: string) {
    const { row, runId } = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [found] = await tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, connectorId), isNull(connector.deletedAt)));
      if (!found) throw new NotFoundException(`Коннектор ${connectorId} не найден`);
      const [run] = await tx
        .insert(syncRun)
        .values({ connectorId, outcome: 'running' })
        .returning();
      if (!run) throw new Error('sync_run не создался');
      return { row: found, runId: run.id };
    });

    const provider = this.providers.get(row.provider);
    if (!provider) {
      await this.finish(
        actor.tenantId,
        connectorId,
        runId,
        'error',
        {},
        `Нет провайдера «${row.provider}»`,
      );
      throw new BadRequestException(`Провайдер «${row.provider}» не поддерживается`);
    }

    try {
      if (!row.configEncrypted) throw new Error('У коннектора нет конфига');
      const config = decryptConfig(row.configEncrypted);
      const result = await provider.sync(config);
      const run = await this.finish(
        actor.tenantId,
        connectorId,
        runId,
        'success',
        result.stats,
        null,
      );
      await this.auditLogService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorIp: actor.ip,
        action: 'connector.synced',
        entityType: 'connector',
        entityId: connectorId,
        after: { outcome: 'success', stats: result.stats },
      });
      return run;
    } catch (error) {
      // сбой коннектора не роняет платформу (ADR-0011) — фиксируем error в sync_run
      const message = error instanceof Error ? error.message : String(error);
      const run = await this.finish(actor.tenantId, connectorId, runId, 'error', {}, message);
      await this.auditLogService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorIp: actor.ip,
        action: 'connector.synced',
        entityType: 'connector',
        entityId: connectorId,
        after: { outcome: 'error', error: message },
      });
      return run;
    }
  }

  /**
   * Собрать записи коннектора без записи sync_run (T-050): для автотестов.
   * Кидает при отсутствии провайдера/конфига/сбое — вызывающий решает, что писать.
   */
  async collectRecords(tenantId: string, connectorId: string): Promise<SyncResult> {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, connectorId), isNull(connector.deletedAt))),
    );
    if (!row) throw new NotFoundException(`Коннектор ${connectorId} не найден`);
    const provider = this.providers.get(row.provider);
    if (!provider) throw new BadRequestException(`Провайдер «${row.provider}» не поддерживается`);
    if (!row.configEncrypted) throw new BadRequestException('У коннектора нет конфига');
    return provider.sync(decryptConfig(row.configEncrypted));
  }

  private async finish(
    tenantId: string,
    connectorId: string,
    runId: string,
    outcome: 'success' | 'error',
    stats: Record<string, number>,
    error: string | null,
  ) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [run] = await tx
        .update(syncRun)
        .set({ outcome, stats, error, finishedAt: sql`now()` })
        .where(eq(syncRun.id, runId))
        .returning();
      await tx
        .update(connector)
        .set({ lastSyncAt: sql`now()`, status: outcome === 'success' ? 'active' : 'error' })
        .where(eq(connector.id, connectorId));
      return {
        id: run?.id,
        outcome: run?.outcome,
        stats: run?.stats,
        error: run?.error,
        finishedAt: run?.finishedAt?.toISOString() ?? null,
      };
    });
  }
}
