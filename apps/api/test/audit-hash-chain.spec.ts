import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { Client } from 'pg';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { auditLog, tenant } from '../src/db/schema';
import { env } from '../src/env';

/**
 * DoD LOG-01 (T-H24): hash-chain аудит-лога — tamper-evidence. verifyChain() пересчитывает
 * цепочку и обязан поймать подмену строки. Threat model: DBA правит БД напрямую (owner
 * обходит RLS — audit_log ENABLE, не FORCE); append-only RLS не даёт править app-роли.
 * Интеграционный: нужна БД (pnpm infra:up + migrate).
 */
const slug = `audit-chain-${Date.now()}`;
const dbService = new DbService();
const auditLogService = new AuditLogService(dbService);
let tenantId: string;

/** Тампер/очистка — под owner-подключением (обходит RLS append-only). */
async function asOwner<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: env.databaseUrlOwner });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  const [t] = await dbService.db.insert(tenant).values({ slug, name: 'Audit Chain' }).returning();
  if (!t) throw new Error('тенант не создался');
  tenantId = t.id;
  for (const action of ['a.created', 'b.updated', 'c.deleted']) {
    await auditLogService.record({ tenantId, action, entityType: 'x', after: { action } });
  }
});

afterAll(async () => {
  await asOwner((c) => c.query('DELETE FROM audit_log WHERE tenant_id = $1', [tenantId]));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('LOG-01 tamper-evidence аудит-лога', () => {
  it('нетронутая цепочка — valid, checked=3', async () => {
    const res = await auditLogService.verifyChain(tenantId);
    expect(res).toMatchObject({ valid: true, checked: 3 });
  });

  it('подмена содержимого строки — verifyChain ловит (content-hash, brokenAt)', async () => {
    const rows = await dbService.withTenant(tenantId, (tx) =>
      tx.select({ id: auditLog.id }).from(auditLog).orderBy(asc(auditLog.id)),
    );
    const victim = rows[1]!.id; // средняя строка
    await asOwner((c) =>
      c.query(`UPDATE audit_log SET after = '{"tampered":true}' WHERE id = $1`, [victim]),
    );

    const res = await auditLogService.verifyChain(tenantId);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('content-hash');
    expect(res.brokenAt).toBe(victim);
  });
});
