import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { DocumentsService } from '../src/documents/documents.service';
import type { FileStorageService } from '../src/files/file-storage.service';
import {
  document,
  documentLink,
  engagement,
  membership,
  role,
  subsidiary,
  tenant,
  user,
} from '../src/db/schema';

/**
 * DoD T-112 (EP-AUDITOR-RELATIONSHIP): конвейер review доказательств.
 * Ревьюит только аудитор (category auditor/external_auditor); внешний аудитор —
 * лишь в своём scope; статус меняется. Интеграционный: инфра + миграции (0069) +
 * `pnpm seed` (пресеты).
 */
const run = Date.now();
const emails = {
  auditor: `er-aud-${run}@firm.io`,
  extA: `er-exta-${run}@firm.io`,
  extB: `er-extb-${run}@firm.io`,
  resp: `er-resp-${run}@t.io`,
};

const dbService = new DbService();
const service = new DocumentsService(
  dbService,
  {} as FileStorageService,
  new AuditLogService(dbService),
);

let tenantId: string;
let subAId: string;
let subBId: string;
let linkId: string;
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
    .values({ slug: `evidence-review-${run}`, name: 'Evidence Review T' })
    .returning();
  tenantId = t!.id;
  const users = await dbService.db
    .insert(user)
    .values(Object.values(emails).map((email) => ({ email, fullName: email, passwordHash: 'x' })))
    .returning();
  const keys = Object.keys(emails) as (keyof typeof emails)[];
  keys.forEach((k, i) => (uid[k] = users[i]!.id));

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
  });

  const auditorRole = await presetRoleId('Admin');
  const extRole = await presetRoleId('External Auditor');
  const collabRole = await presetRoleId('Collaborator');
  const memberships = await dbService.db
    .insert(membership)
    .values([
      { userId: uid.auditor!, tenantId, roleId: auditorRole, category: 'auditor' },
      {
        userId: uid.extA!,
        tenantId,
        roleId: extRole,
        category: 'external_auditor',
        subsidiaryScope: [subAId],
      },
      {
        userId: uid.extB!,
        tenantId,
        roleId: extRole,
        category: 'external_auditor',
        subsidiaryScope: [subBId],
      },
      { userId: uid.resp!, tenantId, roleId: collabRole, category: 'respondent' },
    ])
    .returning();
  const ownerMembershipId = memberships[0]!.id;

  // engagement в дочке A + документ-доказательство, привязанный к нему
  await dbService.withTenant(tenantId, async (tx) => {
    const [eng] = await tx
      .insert(engagement)
      .values({ tenantId, subsidiaryId: subAId, titleI18n: { en: 'Audit A' } })
      .returning();
    const [doc] = await tx
      .insert(document)
      .values({
        tenantId,
        storageKey: 'k',
        filename: 'evidence.pdf',
        mime: 'application/pdf',
        size: 1,
        sha256: 'x',
        ownerMembershipId,
      })
      .returning();
    const [link] = await tx
      .insert(documentLink)
      .values({
        documentId: doc!.id,
        entityType: 'engagement',
        entityId: eng!.id,
        relation: 'evidence',
      })
      .returning();
    linkId = link!.id;
  });
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(documentLink).where(eq(documentLink.id, linkId));
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

describe('evidence review pipeline (T-112)', () => {
  it('внутренний аудитор проставляет accepted', async () => {
    const res = await service.setReviewStatus(actor('auditor'), linkId, 'accepted');
    expect(res.reviewStatus).toBe('accepted');
    const [l] = await dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ s: documentLink.reviewStatus })
        .from(documentLink)
        .where(eq(documentLink.id, linkId)),
    );
    expect(l!.s).toBe('accepted');
  });

  it('внешний аудитор в scope дочки A проставляет flagged', async () => {
    const res = await service.setReviewStatus(actor('extA'), linkId, 'flagged');
    expect(res.reviewStatus).toBe('flagged');
  });

  it('внешний аудитор вне scope (дочка B) → 403', async () => {
    await expect(service.setReviewStatus(actor('extB'), linkId, 'accepted')).rejects.toThrow(
      /scope/,
    );
  });

  it('не-аудитор (respondent) → 403', async () => {
    await expect(service.setReviewStatus(actor('resp'), linkId, 'accepted')).rejects.toThrow(
      /аудитор/,
    );
  });

  it('несуществующая привязка → 404', async () => {
    await expect(
      service.setReviewStatus(actor('auditor'), '11111111-1111-7111-8111-111111111111', 'accepted'),
    ).rejects.toThrow(/не найдена/);
  });
});
