import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { EvidenceRequestsService } from '../src/evidence-requests/evidence-requests.service';
import {
  document,
  engagement,
  evidenceRequest,
  membership,
  notification,
  role,
  subsidiary,
  tenant,
  user,
} from '../src/db/schema';

/**
 * DoD T-114 (EP-AUDITOR-RELATIONSHIP): request list / PBC. Аудитор создаёт запрос
 * (→ уведомление auditee), auditee прикладывает документ (provided → уведомление
 * аудитору), аудитор принимает (accepted); счётчик открытых; scope/auditor-гейты.
 * Интеграционный: инфра + миграции (0070) + `pnpm seed`.
 */
const run = Date.now();
const emails = {
  auditor: `req-aud-${run}@firm.io`,
  extB: `req-extb-${run}@firm.io`,
  resp: `req-resp-${run}@t.io`,
};

const dbService = new DbService();
const notifications = new NotificationsService(dbService);
const service = new EvidenceRequestsService(
  dbService,
  new AuditLogService(dbService),
  notifications,
);

let tenantId: string;
let subAId: string;
let subBId: string;
let engagementId: string;
let documentId: string;
let requestId: string;
let respMembershipId: string;
const uid: Record<string, string> = {};

async function presetRoleId(nameEn: string): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const found = roles.find((r) => r.nameI18n.en === nameEn);
  if (!found) throw new Error(`Нет пресета ${nameEn} — прогнать pnpm seed`);
  return found.id;
}

const actor = (key: keyof typeof emails) => ({ tenantId, userId: uid[key]!, ip: '::1' });

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug: `evidence-request-${run}`, name: 'Evidence Request T' })
    .returning();
  tenantId = t!.id;
  const users = await dbService.db
    .insert(user)
    .values(Object.values(emails).map((email) => ({ email, fullName: email, passwordHash: 'x' })))
    .returning();
  (Object.keys(emails) as (keyof typeof emails)[]).forEach((k, i) => (uid[k] = users[i]!.id));

  await dbService.withTenant(tenantId, async (tx) => {
    const [a] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'A' } })
      .returning();
    const [b] = await tx
      .insert(subsidiary)
      .values({ tenantId, nameI18n: { en: 'B' } })
      .returning();
    subAId = a!.id;
    subBId = b!.id;
    const [eng] = await tx
      .insert(engagement)
      .values({ tenantId, subsidiaryId: subAId, titleI18n: { en: 'Audit A' } })
      .returning();
    engagementId = eng!.id;
  });

  const extRole = await presetRoleId('External Auditor');
  const memberships = await dbService.db
    .insert(membership)
    .values([
      { userId: uid.auditor!, tenantId, roleId: await presetRoleId('Admin'), category: 'auditor' },
      {
        userId: uid.extB!,
        tenantId,
        roleId: extRole,
        category: 'external_auditor',
        subsidiaryScope: [subBId],
      },
      {
        userId: uid.resp!,
        tenantId,
        roleId: await presetRoleId('Collaborator'),
        category: 'respondent',
      },
    ])
    .returning();
  const auditorMembershipId = memberships[0]!.id;
  respMembershipId = memberships[2]!.id;

  await dbService.withTenant(tenantId, async (tx) => {
    const [doc] = await tx
      .insert(document)
      .values({
        tenantId,
        storageKey: 'k',
        filename: 'evidence.pdf',
        mime: 'application/pdf',
        size: 1,
        sha256: 'x',
        ownerMembershipId: auditorMembershipId,
      })
      .returning();
    documentId = doc!.id;
  });
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(evidenceRequest).where(eq(evidenceRequest.tenantId, tenantId));
    await tx.delete(notification).where(eq(notification.tenantId, tenantId));
    await tx.delete(document).where(eq(document.tenantId, tenantId));
    await tx.delete(engagement).where(eq(engagement.tenantId, tenantId));
    await tx.delete(subsidiary).where(eq(subsidiary.tenantId, tenantId));
  });
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  for (const email of Object.values(emails)) {
    await dbService.db.delete(user).where(eq(user.email, email));
  }
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('Evidence request / PBC (T-114)', () => {
  it('аудитор создаёт запрос — requested + уведомление auditee', async () => {
    const res = await service.create(actor('auditor'), {
      engagementId,
      title: 'Политика доступа',
      assigneeMembershipId: respMembershipId,
    });
    expect(res.status).toBe('requested');
    requestId = res.id;
    const inbox = await notifications.listMine(actor('resp'));
    expect(inbox.unread).toBeGreaterThanOrEqual(1);
  });

  it('list — 1 открытый', async () => {
    const list = await service.list(tenantId, engagementId);
    expect(list.open).toBe(1);
    expect(list.total).toBe(1);
    expect(list.items[0]!.status).toBe('requested');
  });

  it('auditee прикладывает документ → provided + уведомление аудитору', async () => {
    const res = await service.provide(actor('resp'), requestId, documentId);
    expect(res.status).toBe('provided');
    const inbox = await notifications.listMine(actor('auditor'));
    expect(inbox.unread).toBeGreaterThanOrEqual(1);
  });

  it('аудитор принимает → accepted, открытых 0', async () => {
    const res = await service.accept(actor('auditor'), requestId);
    expect(res.status).toBe('accepted');
    const list = await service.list(tenantId, engagementId);
    expect(list.open).toBe(0);
    expect(list.total).toBe(1);
  });

  it('повторный accept (уже accepted) → 400', async () => {
    await expect(service.accept(actor('auditor'), requestId)).rejects.toThrow(/provided/);
  });

  it('внешний аудитор вне scope (дочка B) создаёт на engagement дочки A → 403', async () => {
    await expect(service.create(actor('extB'), { engagementId, title: 'x' })).rejects.toThrow(
      /scope/,
    );
  });

  it('не-аудитор (respondent) создаёт → 403', async () => {
    await expect(service.create(actor('resp'), { engagementId, title: 'x' })).rejects.toThrow(
      /аудитор/,
    );
  });

  it('несуществующий engagement → 400', async () => {
    await expect(
      service.create(actor('auditor'), {
        engagementId: '11111111-1111-7111-8111-111111111111',
        title: 'x',
      }),
    ).rejects.toThrow(/Engagement/);
  });
});
