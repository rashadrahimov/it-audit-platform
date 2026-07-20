import { Injectable, Logger } from '@nestjs/common';
import { and, isNotNull, isNull, ne } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { connector, tenant } from '../db/schema';
import { ConnectorSyncService } from './connector-sync.service';
import { isDue } from './connector-schedule';

/**
 * T-V38: автосинк по расписанию. Repeatable-джоба тикает раз в N минут и обходит
 * ВСЕ тенанты (как SlaService/AutoTestService): коннекторы с заданным интервалом,
 * не выключенные и не удалённые, у которых с последнего синка прошло ≥ interval —
 * синкаются. Сбой одного коннектора не роняет обход (ADR-0011).
 */
@Injectable()
export class ConnectorAutoSyncService {
  private readonly logger = new Logger(ConnectorAutoSyncService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly syncService: ConnectorSyncService,
  ) {}

  /** Обход одного тенанта: вернуть, сколько коннекторов синкнули. */
  async runForTenant(tenantId: string, now: Date): Promise<{ synced: number }> {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(
          and(
            isNull(connector.deletedAt),
            isNotNull(connector.syncIntervalMinutes),
            ne(connector.status, 'disabled'),
          ),
        ),
    );
    let synced = 0;
    for (const row of rows) {
      if (!isDue(row.lastSyncAt, row.syncIntervalMinutes, now)) continue;
      try {
        await this.syncService.run({ tenantId, userId: null }, row.id);
        synced += 1;
      } catch (error) {
        // сбой конкретного коннектора не останавливает обход
        this.logger.warn(`autosync ${row.id} (${row.provider}): ${String(error)}`);
      }
    }
    return { synced };
  }

  /** Все тенанты (repeatable-джоба): now берётся один раз на прогон. */
  async run(): Promise<{ tenants: number; synced: number }> {
    const now = new Date();
    const tenants = await this.dbService.db.select({ id: tenant.id }).from(tenant);
    let synced = 0;
    for (const t of tenants) {
      const result = await this.runForTenant(t.id, now);
      synced += result.synced;
    }
    return { tenants: tenants.length, synced };
  }
}
