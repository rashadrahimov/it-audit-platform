import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { RbacService } from '../src/rbac/rbac.service';
import { membership, role, tenant, user } from '../src/db/schema';

/**
 * DoD SEC-04 (T-H04): RbacService.fieldLevels резолвит field_permission роли.
 * Использует глобальный seed'ленный оверлей Collaborator→finding.recommendation=hidden.
 * Интеграционный: нужна БД + `pnpm seed`.
 */
const run = Date.now();
const slug = `fl-${run}`;
const email = `fl-collab-${run}@t.io`;
const approverEmail = `fl-approver-${run}@t.io`;

const dbService = new DbService();
const rbacService = new RbacService(dbService);
let tenantId: string;
let userId: string;
let approverUserId: string;

async function presetRoleId(nameEn: string): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const found = roles.find((r) => r.nameI18n.en === nameEn);
  if (!found) throw new Error(`Нет пресета ${nameEn} — прогнать pnpm seed`);
  return found.id;
}

beforeAll(async () => {
  const [t] = await dbService.db.insert(tenant).values({ slug, name: 'FL' }).returning();
  tenantId = t!.id;
  const [u] = await dbService.db
    .insert(user)
    .values({ email, fullName: 'FL Collab', passwordHash: 'x' })
    .returning();
  userId = u!.id;
  await dbService.db
    .insert(membership)
    .values({ userId, tenantId, roleId: await presetRoleId('Collaborator') });
  const [ap] = await dbService.db
    .insert(user)
    .values({ email: approverEmail, fullName: 'FL Approver', passwordHash: 'x' })
    .returning();
  approverUserId = ap!.id;
  await dbService.db
    .insert(membership)
    .values({ userId: approverUserId, tenantId, roleId: await presetRoleId('Approver') });
});

afterAll(async () => {
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  await dbService.db.delete(user).where(inArray(user.email, [email, approverEmail]));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('RbacService.fieldLevels (SEC-04)', () => {
  it('Collaborator → finding.recommendation = hidden (из seed)', async () => {
    const levels = await rbacService.fieldLevels(userId, tenantId, 'finding');
    expect(levels.recommendation).toBe('hidden');
  });

  it('другая сущность — оверлея нет', async () => {
    const levels = await rbacService.fieldLevels(userId, tenantId, 'risk');
    expect(levels).toEqual({});
  });

  it('не-член тенанта → пусто', async () => {
    const levels = await rbacService.fieldLevels(crypto.randomUUID(), tenantId, 'finding');
    expect(levels).toEqual({});
  });

  it('Approver → personnel.email = hidden (из seed, T-H06)', async () => {
    const levels = await rbacService.fieldLevels(approverUserId, tenantId, 'personnel');
    expect(levels.email).toBe('hidden');
  });

  it('роли независимы: Collaborator не имеет personnel-оверлея', async () => {
    const levels = await rbacService.fieldLevels(userId, tenantId, 'personnel');
    expect(levels).toEqual({});
  });
});
