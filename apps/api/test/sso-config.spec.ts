import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { SsoConfigService } from '../src/auth/sso-config.service';
import { ssoConfig, tenant } from '../src/db/schema';

/**
 * DoD V49 (T-H39): CRUD per-tenant SSO-конфига + диспатч по домену. Домен уникален
 * глобально (перехват чужим тенантом → 409), секрет не отдаётся. Интеграционный: БД.
 */
const run = Date.now();
const domain = `t-${run}.io`;

const dbService = new DbService();
const service = new SsoConfigService(dbService);

let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const [a] = await dbService.db
    .insert(tenant)
    .values({ name: 'A', slug: `sso-a-${run}` })
    .returning();
  const [b] = await dbService.db
    .insert(tenant)
    .values({ name: 'B', slug: `sso-b-${run}` })
    .returning();
  tenantA = a!.id;
  tenantB = b!.id;
});

afterAll(async () => {
  await dbService.db.delete(ssoConfig).where(eq(ssoConfig.tenantId, tenantA));
  await dbService.db.delete(ssoConfig).where(eq(ssoConfig.tenantId, tenantB));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantA));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantB));
  await dbService.onModuleDestroy();
});

describe('SsoConfigService', () => {
  it('upsert: секрет шифруется и наружу не отдаётся', async () => {
    const view = await service.upsert(tenantA, {
      emailDomain: domain,
      method: 'oidc',
      providerLabel: 'KC',
      issuerUrl: 'http://idp.local/realms/x',
      clientId: 'app',
      clientSecret: 'top-secret',
    });
    expect(view.hasSecret).toBe(true);
    expect(view.emailDomain).toBe(domain);
    expect(view).not.toHaveProperty('clientSecret');
    expect(view).not.toHaveProperty('secretEncrypted');
  });

  it('dispatch: домен с конфигом → sso, чужой домен → password', async () => {
    expect((await service.dispatch(`ivan@${domain}`)).dispatch).toBe('sso');
    expect((await service.dispatch(`ivan@nope-${run}.io`)).dispatch).toBe('password');
    expect((await service.dispatch('garbage')).dispatch).toBe('password');
  });

  it('домен глобально уникален: чужой тенант → 409', async () => {
    await expect(
      service.upsert(tenantB, { emailDomain: domain, method: 'oidc', providerLabel: 'X' }),
    ).rejects.toThrow();
  });

  it('update без секрета не стирает существующий', async () => {
    const view = await service.upsert(tenantA, {
      emailDomain: domain,
      method: 'saml',
      providerLabel: 'ADFS',
    });
    expect(view.method).toBe('saml');
    expect(view.providerLabel).toBe('ADFS');
    expect(view.hasSecret).toBe(true); // секрет с прошлого upsert сохранён
  });

  it('list скоупится по тенанту; remove удаляет', async () => {
    const listA = await service.list(tenantA);
    expect(listA).toHaveLength(1);
    expect(await service.list(tenantB)).toHaveLength(0);

    const { deleted } = await service.remove(tenantA, listA[0]!.id);
    expect(deleted).toBe(true);
    expect(await service.list(tenantA)).toHaveLength(0);
    // после удаления диспатч домена → password
    expect((await service.dispatch(`ivan@${domain}`)).dispatch).toBe('password');
  });
});
