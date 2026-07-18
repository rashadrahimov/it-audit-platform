import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { ConfigListsService, type ListItem } from '../src/config-lists/config-lists.service';
import { configList, tenant } from '../src/db/schema';

/**
 * DoD TEC-03 (T-H02): set сохраняет снимок прошлых items в history.
 * Интеграционный: нужна БД (pnpm infra:up + migrate).
 */
const run = Date.now();
const slug = `cfg-hist-${run}`;
const dbService = new DbService();
const auditLogService = new AuditLogService(dbService);
const service = new ConfigListsService(dbService, auditLogService);

let tenantId: string;
const actor = () => ({ tenantId, userId: tenantId, ip: '::1' });
const v1: ListItem[] = [{ code: 'a', labelI18n: { en: 'A' } }];
const v2: ListItem[] = [{ code: 'x', labelI18n: { en: 'X' } }];
const v3: ListItem[] = [{ code: 'p', labelI18n: { en: 'P' } }];

beforeAll(async () => {
  const [t] = await dbService.db.insert(tenant).values({ slug, name: 'Cfg Hist' }).returning();
  if (!t) throw new Error('тенант не создался');
  tenantId = t.id;
});

afterAll(async () => {
  await dbService.withTenant(tenantId, (tx) =>
    tx.delete(configList).where(eq(configList.tenantId, tenantId)),
  );
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('TEC-03 история config-list', () => {
  it('первый set — история пустая (нечего снимать)', async () => {
    await service.set(actor(), 'k', v1);
    const { versions } = await service.getHistory(tenantId, 'k');
    expect(versions).toEqual([]);
  });

  it('второй set — снимок v1 в истории', async () => {
    await service.set(actor(), 'k', v2);
    const { versions } = await service.getHistory(tenantId, 'k');
    expect(versions).toHaveLength(1);
    expect((versions[0]!.items as ListItem[]).map((i) => i.code)).toEqual(['a']);
    expect(versions[0]!.by).toBe(tenantId);
  });

  it('третий set — свежий снимок сверху (v2), затем v1', async () => {
    await service.set(actor(), 'k', v3);
    const { versions } = await service.getHistory(tenantId, 'k');
    expect(versions).toHaveLength(2);
    expect((versions[0]!.items as ListItem[]).map((i) => i.code)).toEqual(['x']); // v2 — свежий снимок
    expect((versions[1]!.items as ListItem[]).map((i) => i.code)).toEqual(['a']); // v1 — старее
  });
});
