import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { MembershipsService } from '../src/memberships/memberships.service';
import { RbacService } from '../src/rbac/rbac.service';
import { membership, role, subsidiary, tenant, user } from '../src/db/schema';

/**
 * DoD T-109 (EP-AUDITOR-RELATIONSHIP): выдача/отзыв доступа участника.
 * update меняет роль/scope; revoke → status=revoked → resolveAccess отказывает;
 * нельзя понизить/снять последнего администратора. Интеграционный: инфра +
 * миграции + `pnpm seed` (пресеты Admin / External Auditor / Collaborator).
 */
const run = Date.now();
const slug = `membership-access-${run}`;
const emails = [`ma-admin-${run}@t.io`, `ma-ext-${run}@firm.io`];

const dbService = new DbService();
const service = new MembershipsService(dbService, new AuditLogService(dbService));
const rbac = new RbacService(dbService);

let tenantId: string;
let adminUserId: string;
let extUserId: string;
let adminMembershipId: string;
let extMembershipId: string;
let subAId: string;
let subBId: string;
let collaboratorRoleId: string;

async function presetRoleId(nameEn: string): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const found = roles.find((r) => r.nameI18n.en === nameEn);
  if (!found) throw new Error(`Нет пресета ${nameEn} — прогнать pnpm seed`);
  return found.id;
}

const actor = () => ({ tenantId, userId: adminUserId, ip: '::1' });

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug, name: 'Membership Access T' })
    .returning();
  tenantId = t!.id;
  const users = await dbService.db
    .insert(user)
    .values(emails.map((email) => ({ email, fullName: email, passwordHash: 'x' })))
    .returning();
  adminUserId = users[0]!.id;
  extUserId = users[1]!.id;

  await dbService.withTenant(tenantId, async (tx) => {
    const [a] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'Sub A' } })
      .returning();
    const [b] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'Sub B' } })
      .returning();
    subAId = a!.id;
    subBId = b!.id;
  });

  const adminRole = await presetRoleId('Admin');
  const extRole = await presetRoleId('External Auditor');
  collaboratorRoleId = await presetRoleId('Collaborator');
  const memberships = await dbService.db
    .insert(membership)
    .values([
      { userId: adminUserId, tenantId, roleId: adminRole, category: 'auditor' },
      {
        userId: extUserId,
        tenantId,
        roleId: extRole,
        category: 'external_auditor',
        subsidiaryScope: [subAId],
      },
    ])
    .returning();
  adminMembershipId = memberships[0]!.id;
  extMembershipId = memberships[1]!.id;
});

afterAll(async () => {
  await dbService.withTenant(tenantId, (tx) =>
    tx.delete(subsidiary).where(eq(subsidiary.tenantId, tenantId)),
  );
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  for (const email of emails) await dbService.db.delete(user).where(eq(user.email, email));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('MembershipsService update/revoke (T-109)', () => {
  it('update меняет scoped-доступ участника', async () => {
    const res = await service.update(actor(), extMembershipId, { subsidiaryScope: [subBId] });
    expect(res.subsidiaryScope).toEqual([subBId]);
    const [m] = await dbService.db
      .select({ scope: membership.subsidiaryScope })
      .from(membership)
      .where(eq(membership.id, extMembershipId));
    expect(m!.scope).toEqual([subBId]);
  });

  it('update с чужой дочкой в scope → 400', async () => {
    await expect(
      service.update(actor(), extMembershipId, {
        subsidiaryScope: ['11111111-1111-7111-8111-111111111111'],
      }),
    ).rejects.toThrow(/дочки/);
  });

  it('понизить последнего администратора нельзя → 400', async () => {
    await expect(
      service.update(actor(), adminMembershipId, { roleId: collaboratorRoleId }),
    ).rejects.toThrow(/администратора/);
  });

  it('revoke внешнего аудитора → status=revoked, доступ закрыт (resolveAccess отказывает)', async () => {
    const before = await rbac.resolveAccess(extUserId, slug, {
      resource: 'engagement',
      action: 'view',
      level: 'view',
    });
    expect(before.allowed).toBe(true);

    const res = await service.revoke(actor(), extMembershipId);
    expect(res.status).toBe('revoked');

    const after = await rbac.resolveAccess(extUserId, slug, {
      resource: 'engagement',
      action: 'view',
      level: 'view',
    });
    expect(after.allowed).toBe(false);
  });

  it('revoke идемпотентен (повторный → revoked без ошибки)', async () => {
    const res = await service.revoke(actor(), extMembershipId);
    expect(res.status).toBe('revoked');
  });

  it('снять последнего администратора нельзя → 400', async () => {
    await expect(service.revoke(actor(), adminMembershipId)).rejects.toThrow(/администратора/);
  });
});
