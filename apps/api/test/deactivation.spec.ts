import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { inArray } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { AuthService } from '../src/auth/auth.service';
import { PasswordService } from '../src/auth/password.service';
import { UsersService } from '../src/users/users.service';
import { user } from '../src/db/schema';

/** DoD T-017: деактивированный не логинится (offboarding и авто по неактивности). */
const run = Date.now();
const PASSWORD = 'Valid-Password-17';
const emails = [`deact-manual-${run}@t.io`, `deact-idle-${run}@t.io`];

const dbService = new DbService();
const passwordService = new PasswordService();
const auditLogService = new AuditLogService(dbService);
const usersService = new UsersService(dbService, auditLogService);
const authService = new AuthService(
  dbService,
  passwordService,
  new JwtService({ secret: 't' }),
  auditLogService,
);
let manualId: string;

beforeAll(async () => {
  const passwordHash = await passwordService.hash(PASSWORD);
  const oldLogin = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000); // 120 дней назад
  const [manual] = await dbService.db
    .insert(user)
    .values({ email: emails[0] as string, fullName: 'M', passwordHash })
    .returning();
  if (!manual) throw new Error('юзер не создался');
  manualId = manual.id;
  await dbService.db
    .insert(user)
    .values({ email: emails[1] as string, fullName: 'I', passwordHash, lastLoginAt: oldLogin });
});

afterAll(async () => {
  await dbService.db.delete(user).where(inArray(user.email, emails));
  await dbService.onModuleDestroy();
});

describe('деактивация аккаунтов (T-017)', () => {
  it('до деактивации логин проходит', async () => {
    const token = await authService.login({ email: emails[0] as string, password: PASSWORD });
    expect('accessToken' in token && token.accessToken).toBeTruthy();
  });

  it('offboarding: после deactivate() логин отбивается', async () => {
    await usersService.deactivate(manualId);
    await expect(
      authService.login({ email: emails[0] as string, password: PASSWORD }),
    ).rejects.toThrow();
  });

  it('авто: неактивный 120 дней деактивируется джобой и не логинится', async () => {
    const count = await usersService.deactivateInactive(90);
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(
      authService.login({ email: emails[1] as string, password: PASSWORD }),
    ).rejects.toThrow();
  });

  it('порог уважается: свежие аккаунты не трогаются повторным прогоном', async () => {
    await usersService.reactivate(manualId); // lastLoginAt = now
    const count = await usersService.deactivateInactive(90);
    const [reactivated] = await dbService.db
      .select()
      .from(user)
      .where(inArray(user.email, [emails[0] as string]));
    expect(reactivated?.status).toBe('active');
    expect(count).toBe(0);
  });
});
