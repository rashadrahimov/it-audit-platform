import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { Client } from 'pg';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { auditLog, tenant, user } from '../src/db/schema';
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
let userId: string;

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
  const [u] = await dbService.db
    .insert(user)
    .values({
      email: `audit-chain-${Date.now()}@example.test`,
      fullName: 'Audit Reviewer',
      passwordHash: null,
    })
    .returning();
  if (!u) throw new Error('пользователь не создался');
  userId = u.id;
  for (const action of ['a.created', 'b.updated', 'c.deleted']) {
    await auditLogService.record({ tenantId, action, entityType: 'x', after: { action } });
  }
  await auditLogService.record({
    tenantId,
    actorUserId: userId,
    actorIp: '192.0.2.10',
    action: 'finding.approved',
    entityType: 'finding',
    before: { recommendation: 'sensitive old value' },
    after: { recommendation: 'sensitive new value' },
  });
});

afterAll(async () => {
  await asOwner((c) => c.query('DELETE FROM audit_log WHERE tenant_id = $1', [tenantId]));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.db.delete(user).where(eq(user.id, userId));
  await dbService.onModuleDestroy();
});

describe('LOG-01 tamper-evidence аудит-лога', () => {
  it('нетронутая цепочка — valid, checked=4', async () => {
    const res = await auditLogService.verifyChain(tenantId);
    expect(res).toMatchObject({ valid: true, checked: 4 });
  });

  it('recent отдаёт traceability-метаданные без sensitive before/after payload', async () => {
    const rows = await auditLogService.recent(tenantId, 1);
    expect(rows).toHaveLength(1);
    const event = rows[0]!;
    expect(event).toMatchObject({
      action: 'finding.approved',
      entityType: 'finding',
      actorUserId: userId,
      actorName: 'Audit Reviewer',
      actorIp: '192.0.2.10',
      hasBefore: true,
      hasAfter: true,
      hashPresent: true,
    });
    expect(event.actorEmail).toContain('@example.test');
    expect(event).not.toHaveProperty('before');
    expect(event).not.toHaveProperty('after');
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
