import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import { and, eq, isNull } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuthService } from '../src/auth/auth.service';
import { MagicLinkService } from '../src/auth/magic-link.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { PasswordService } from '../src/auth/password.service';
import { EmailService } from '../src/email/email.service';
import type { EmailProvider, OutgoingEmail } from '../src/email/email.provider';
import { magicLinkToken, user } from '../src/db/schema';
import { generateMagicToken, magicLinkExpiresAt } from '../src/auth/magic-link-token';
import { authTokenResponseSchema, mfaChallengeResponseSchema } from '@it-audit/shared';
import { env } from '../src/env';

/**
 * DoD magic-link (T-H38): запрос шлёт одноразовую ссылку, consume её обменивает
 * на сессию, повтор — 401, истёкшая — 401, MFA-аккаунт не обходит второй фактор.
 * Интеграционный: нужна БД (pnpm infra:up + migrate). Email — capturing-фейк
 * (детерминизм; сквозная проверка Mailpit — в /verify руками).
 */
const run = Date.now();
const email = `magic-${run}@t.io`;

const sent: OutgoingEmail[] = [];
const fakeProvider: EmailProvider = {
  send: async (e) => {
    sent.push(e);
    return { messageId: `fake-${sent.length}` };
  },
};

const dbService = new DbService();
const passwordService = new PasswordService();
const jwtService = new JwtService({
  secret: env.jwtSecret,
  signOptions: { expiresIn: env.jwtTtlSeconds },
});
const auditLogService = new AuditLogService(dbService);
const emailService = new EmailService(fakeProvider);
const authService = new AuthService(dbService, passwordService, jwtService, auditLogService);
const magicLinkService = new MagicLinkService(
  dbService,
  emailService,
  auditLogService,
  authService,
);

let userId: string;

function tokenFromLastEmail(): string {
  const last = sent.at(-1);
  if (!last) throw new Error('письмо не отправлено');
  const url = last.text.match(/https?:\/\/\S+/)?.[0];
  const token = url ? new URL(url).searchParams.get('token') : null;
  if (!token) throw new Error('в письме нет token');
  return token;
}

beforeAll(async () => {
  // passwordHash NULL — доказываем, что passwordless-вход работает и без пароля
  const [u] = await dbService.db
    .insert(user)
    .values({ email, fullName: 'Magic Tester', locale: 'ru' })
    .returning();
  if (!u) throw new Error('тест-юзер не создался');
  userId = u.id;
});

afterAll(async () => {
  const owner = new Client({ connectionString: env.databaseUrlOwner });
  await owner.connect();
  await owner.query('DELETE FROM auth_event WHERE user_id = $1', [userId]);
  await owner.end();
  await dbService.db.delete(magicLinkToken).where(eq(magicLinkToken.userId, userId));
  await dbService.db.delete(user).where(eq(user.id, userId));
  await dbService.onModuleDestroy();
});

describe('MagicLinkService', () => {
  it('request → письмо со ссылкой + неиспользованный токен в БД', async () => {
    await magicLinkService.request({ email });
    expect(sent.at(-1)?.to).toBe(email);
    const rows = await dbService.db
      .select()
      .from(magicLinkToken)
      .where(and(eq(magicLinkToken.userId, userId), isNull(magicLinkToken.consumedAt)));
    expect(rows).toHaveLength(1);
  });

  it('consume → сессия (accessToken), токен помечен использованным', async () => {
    const token = tokenFromLastEmail();
    const res = await magicLinkService.consume(token);
    expect(authTokenResponseSchema.safeParse(res).success).toBe(true);
    const active = await dbService.db
      .select()
      .from(magicLinkToken)
      .where(and(eq(magicLinkToken.userId, userId), isNull(magicLinkToken.consumedAt)));
    expect(active).toHaveLength(0);
  });

  it('повторный consume той же ссылки → 401 (одноразовость)', async () => {
    const token = tokenFromLastEmail();
    await expect(magicLinkService.consume(token)).rejects.toThrow();
  });

  it('новый request гасит прежние невыпущенные ссылки (одна активная)', async () => {
    await magicLinkService.request({ email });
    await magicLinkService.request({ email });
    const active = await dbService.db
      .select()
      .from(magicLinkToken)
      .where(and(eq(magicLinkToken.userId, userId), isNull(magicLinkToken.consumedAt)));
    expect(active).toHaveLength(1);
  });

  it('истёкшая ссылка → 401', async () => {
    // прямая вставка токена с прошедшим сроком
    const { token, tokenHash } = generateMagicToken();
    await dbService.db.insert(magicLinkToken).values({
      userId,
      tokenHash,
      expiresAt: magicLinkExpiresAt(new Date(), -1),
    });
    await expect(magicLinkService.consume(token)).rejects.toThrow();
  });

  it('несуществующий email → тихо, без письма', async () => {
    const before = sent.length;
    await magicLinkService.request({ email: `nope-${run}@t.io` });
    expect(sent.length).toBe(before);
  });

  it('MFA-аккаунт: consume → челлендж, второй фактор не обойдён', async () => {
    await dbService.db.update(user).set({ mfaEnabled: true }).where(eq(user.id, userId));
    await magicLinkService.request({ email });
    const token = tokenFromLastEmail();
    const res = await magicLinkService.consume(token);
    expect(mfaChallengeResponseSchema.safeParse(res).success).toBe(true);
    await dbService.db.update(user).set({ mfaEnabled: false }).where(eq(user.id, userId));
  });

  it('сбой отправки письма не роняет request (202-семантика, без оракула)', async () => {
    const throwing = new MagicLinkService(
      dbService,
      new EmailService({
        send: async () => {
          throw new Error('smtp down');
        },
      }),
      auditLogService,
      authService,
    );
    await expect(throwing.request({ email })).resolves.toBeUndefined();
    const active = await dbService.db
      .select()
      .from(magicLinkToken)
      .where(and(eq(magicLinkToken.userId, userId), isNull(magicLinkToken.consumedAt)));
    expect(active.length).toBeGreaterThanOrEqual(1);
  });
});
