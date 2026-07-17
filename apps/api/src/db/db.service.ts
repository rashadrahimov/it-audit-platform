import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { env } from '../env';

/** Транзакция с установленным контекстом тенанта — единственный способ читать/писать доменные таблицы. */
export type TenantDb = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

  /** Доступ без контекста тенанта — только над-тенантные таблицы (tenant, user, membership). */
  readonly db: NodePgDatabase = drizzle(this.pool);

  /**
   * RLS-контекст (ADR-0003): set_config('app.tenant_id', ..., local=true) внутри
   * транзакции — политики Postgres отфильтруют чужих даже при «забытом» .where.
   */
  async withTenant<T>(tenantId: string, fn: (tx: TenantDb) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => {});
  }
}
