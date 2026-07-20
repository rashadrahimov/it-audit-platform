import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { AuditLogService } from '../src/audit/audit-log.service';
import { DbService } from '../src/db/db.service';
import { RbacService } from '../src/rbac/rbac.service';
import { membership, role, tenant, user } from '../src/db/schema';

/**
 * DoD T-020: Collaborator не может Edit там, где нет права.
 * Интеграционный: нужна инфраструктура + миграции + сид пресет-ролей (pnpm seed).
 */
const run = Date.now();
const slug = `rbac-test-${run}`;
const emails = [`rbac-collab-${run}@t.io`, `rbac-admin-${run}@t.io`];

const dbService = new DbService();
const rbacService = new RbacService(dbService, new AuditLogService(dbService));
let tenantId: string;
let collabId: string;
let adminId: string;

async function presetRoleId(nameEn: string): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const found = roles.find((r) => r.nameI18n.en === nameEn);
  if (!found) throw new Error(`Нет пресета ${nameEn} — прогнать pnpm seed`);
  return found.id;
}

beforeAll(async () => {
  const [t] = await dbService.db.insert(tenant).values({ slug, name: 'RBAC T' }).returning();
  if (!t) throw new Error('тенант не создался');
  tenantId = t.id;
  const [collab] = await dbService.db
    .insert(user)
    .values({ email: emails[0] as string, fullName: 'Collab', passwordHash: 'x' })
    .returning();
  const [admin] = await dbService.db
    .insert(user)
    .values({ email: emails[1] as string, fullName: 'Admin', passwordHash: 'x' })
    .returning();
  if (!collab || !admin) throw new Error('юзеры не создались');
  collabId = collab.id;
  adminId = admin.id;
  await dbService.db.insert(membership).values([
    { userId: collabId, tenantId, roleId: await presetRoleId('Collaborator') },
    { userId: adminId, tenantId, roleId: await presetRoleId('Admin') },
  ]);
});

afterAll(async () => {
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  await dbService.db.delete(user).where(inArray(user.email, emails));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('RBAC enforcement (ADR-0013)', () => {
  it('Collaborator: settings=none — edit запрещён', async () => {
    const access = await rbacService.resolveAccess(collabId, slug, {
      resource: 'settings',
      action: 'edit',
      level: 'edit',
    });
    expect(access.level).toBe('none');
    expect(access.allowed).toBe(false);
  });

  it('Collaborator: engagement=view — view разрешён, edit нет', async () => {
    const view = await rbacService.resolveAccess(collabId, slug, {
      resource: 'engagement',
      action: 'view',
      level: 'view',
    });
    expect(view.allowed).toBe(true);
    const edit = await rbacService.resolveAccess(collabId, slug, {
      resource: 'engagement',
      action: 'edit',
      level: 'edit',
    });
    expect(edit.allowed).toBe(false);
  });

  it('Collaborator: finding=edit — разрешён', async () => {
    const access = await rbacService.resolveAccess(collabId, slug, {
      resource: 'finding',
      action: 'edit',
      level: 'edit',
    });
    expect(access.allowed).toBe(true);
  });

  it('Admin: edit разрешён везде; без membership — доступа нет', async () => {
    const admin = await rbacService.resolveAccess(adminId, slug, {
      resource: 'settings',
      action: 'edit',
      level: 'edit',
    });
    expect(admin.allowed).toBe(true);
    const stranger = await rbacService.resolveAccess(collabId, 'demo', {
      resource: 'finding',
      action: 'view',
      level: 'view',
    });
    expect(stranger.allowed).toBe(false);
  });
});
