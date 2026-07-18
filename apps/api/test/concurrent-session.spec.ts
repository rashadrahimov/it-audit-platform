import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuthService } from '../src/auth/auth.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { PasswordService } from '../src/auth/password.service';
import { authEvent, user } from '../src/db/schema';
import { env } from '../src/env';

/**
 * DoD SEC-07 (T-H01): повторный логин в окне JWT_TTL фиксирует событие
 * `concurrent_session`. Интеграционный: нужна БД (pnpm infra:up + migrate).
 */
const run = Date.now();
const email = `concurrent-${run}@t.io`;
const password = 'Concurrent-Test-2026';

const dbService = new DbService();
const passwordService = new PasswordService();
const jwtService = new JwtService({
  secret: env.jwtSecret,
  signOptions: { expiresIn: env.jwtTtlSeconds },
});
const auditLogService = new AuditLogService(dbService);
const authService = new AuthService(dbService, passwordService, jwtService, auditLogService);

let userId: string;

async function concurrentCount(): Promise<number> {
  const rows = await dbService.db
    .select({ id: authEvent.id })
    .from(authEvent)
    .where(and(eq(authEvent.userId, userId), eq(authEvent.event, 'concurrent_session')));
  return rows.length;
}

beforeAll(async () => {
  const [u] = await dbService.db
    .insert(user)
    .values({
      email,
      fullName: 'Concurrent Tester',
      passwordHash: await passwordService.hash(password),
      passwordChangedAt: new Date(),
    })
    .returning();
  if (!u) throw new Error('тест-юзер не создался');
  userId = u.id;
});

afterAll(async () => {
  // auth_event append-only для app (только INSERT/SELECT) — чистим под владельцем схемы
  const owner = new Client({ connectionString: env.databaseUrlOwner });
  await owner.connect();
  await owner.query('DELETE FROM auth_event WHERE user_id = $1', [userId]);
  await owner.end();
  await dbService.db.delete(user).where(eq(user.id, userId));
  await dbService.onModuleDestroy();
});

describe('SEC-07 конкурентные сессии', () => {
  it('первый логин — без события concurrent_session', async () => {
    const res = await authService.login({ email, password });
    expect('accessToken' in res).toBe(true);
    expect(await concurrentCount()).toBe(0);
  });

  it('повторный логин в окне TTL — фиксирует concurrent_session, но не блокирует (detect)', async () => {
    const res = await authService.login({ email, password });
    expect('accessToken' in res).toBe(true); // detect-политика: логин проходит
    expect(await concurrentCount()).toBe(1);
  });

  it('третий логин — ещё одно событие', async () => {
    await authService.login({ email, password });
    expect(await concurrentCount()).toBe(2);
  });
});
