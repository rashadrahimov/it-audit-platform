import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { MembershipsService } from '../src/memberships/memberships.service';
import { RbacService } from '../src/rbac/rbac.service';
import { membership, role, tenant, user } from '../src/db/schema';

/**
 * DoD T-110 (EP-AUDITOR-RELATIONSHIP): окно доступа (data access date).
 * Вне окна resolveAccess отказывает; NULL-границы = бессрочно; from>until → 400.
 * Интеграционный: инфра + миграции (0069) + `pnpm seed` (пресет External Auditor).
 */
const run = Date.now();
const slug = `data-access-${run}`;
const email = `daw-ext-${run}@firm.io`;
const DAY = 86_400_000;

const dbService = new DbService();
const service = new MembershipsService(dbService, new AuditLogService(dbService));
const rbac = new RbacService(dbService);

let tenantId: string;
let userId: string;
let membershipId: string;

const actor = () => ({ tenantId, userId, ip: '::1' });
const canView = async () =>
  (
    await rbac.resolveAccess(userId, slug, {
      resource: 'engagement',
      action: 'view',
      level: 'view',
    })
  ).allowed;

beforeAll(async () => {
  const [t] = await dbService.db.insert(tenant).values({ slug, name: 'Data Access T' }).returning();
  tenantId = t!.id;
  const [u] = await dbService.db
    .insert(user)
    .values({ email, fullName: email, passwordHash: 'x' })
    .returning();
  userId = u!.id;
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const extRole = roles.find((r) => r.nameI18n.en === 'External Auditor');
  if (!extRole) throw new Error('Нет пресета External Auditor — прогнать pnpm seed');
  const [m] = await dbService.db
    .insert(membership)
    .values({ userId, tenantId, roleId: extRole.id, category: 'external_auditor' })
    .returning();
  membershipId = m!.id;
});

afterAll(async () => {
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  await dbService.db.delete(user).where(eq(user.email, email));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('data-access window (T-110)', () => {
  it('без окна (NULL/NULL) — доступ есть', async () => {
    expect(await canView()).toBe(true);
  });

  it('dataAccessFrom в будущем — доступ закрыт (ещё не начался)', async () => {
    await service.update(actor(), membershipId, { dataAccessFrom: new Date(Date.now() + DAY) });
    expect(await canView()).toBe(false);
  });

  it('dataAccessUntil в прошлом — доступ закрыт (истёк)', async () => {
    await service.update(actor(), membershipId, {
      dataAccessFrom: null,
      dataAccessUntil: new Date(Date.now() - DAY),
    });
    expect(await canView()).toBe(false);
  });

  it('окно охватывает сейчас — доступ есть', async () => {
    await service.update(actor(), membershipId, {
      dataAccessFrom: new Date(Date.now() - DAY),
      dataAccessUntil: new Date(Date.now() + DAY),
    });
    expect(await canView()).toBe(true);
  });

  it('from позже until → 400', async () => {
    await expect(
      service.update(actor(), membershipId, {
        dataAccessFrom: new Date(Date.now() + 2 * DAY),
        dataAccessUntil: new Date(Date.now() + DAY),
      }),
    ).rejects.toThrow(/позже/);
  });

  it('снять окно (NULL/NULL) — доступ снова бессрочный', async () => {
    await service.update(actor(), membershipId, { dataAccessFrom: null, dataAccessUntil: null });
    expect(await canView()).toBe(true);
  });
});
