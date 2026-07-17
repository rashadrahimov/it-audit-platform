import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { DbService } from '../src/db/db.service';
import { subsidiary, tenant } from '../src/db/schema';

/**
 * Интеграционный тест RLS (DoD T-011): требует поднятую инфраструктуру
 * (pnpm infra:up) и применённые миграции (pnpm db:migrate).
 * Доказывает: запрос из тенанта A не видит данные тенанта B даже при
 * «забытом» фильтре по tenant_id в коде.
 */
const run = Date.now();
const slugA = `rls-test-a-${run}`;
const slugB = `rls-test-b-${run}`;

const dbService = new DbService();
let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  const [a] = await dbService.db.insert(tenant).values({ slug: slugA, name: 'RLS A' }).returning();
  const [b] = await dbService.db.insert(tenant).values({ slug: slugB, name: 'RLS B' }).returning();
  if (!a || !b) throw new Error('Не создались тестовые тенанты');
  tenantAId = a.id;
  tenantBId = b.id;
  await dbService.withTenant(tenantAId, (tx) =>
    tx.insert(subsidiary).values({ tenantId: tenantAId, nameI18n: { en: 'Sub A' }, code: 'a-1' }),
  );
  await dbService.withTenant(tenantBId, (tx) =>
    tx.insert(subsidiary).values({ tenantId: tenantBId, nameI18n: { en: 'Sub B' }, code: 'b-1' }),
  );
});

afterAll(async () => {
  await dbService.withTenant(tenantAId, (tx) =>
    tx.delete(subsidiary).where(eq(subsidiary.tenantId, tenantAId)),
  );
  await dbService.withTenant(tenantBId, (tx) =>
    tx.delete(subsidiary).where(eq(subsidiary.tenantId, tenantBId)),
  );
  await dbService.db.delete(tenant).where(inArray(tenant.slug, [slugA, slugB]));
  await dbService.onModuleDestroy();
});

describe('RLS-изоляция тенантов (ADR-0003)', () => {
  it('«забытый» фильтр: SELECT без WHERE отдаёт только строки своего тенанта', async () => {
    const rows = await dbService.withTenant(tenantAId, (tx) => tx.select().from(subsidiary));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r) => r.tenantId === tenantBId)).toBe(false);
  });

  it('тенант B симметрично не видит A', async () => {
    const rows = await dbService.withTenant(tenantBId, (tx) => tx.select().from(subsidiary));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === tenantBId)).toBe(true);
  });

  it('без контекста тенанта не видно ничего (default deny)', async () => {
    const rows = await dbService.db.select().from(subsidiary);
    expect(rows).toHaveLength(0);
  });

  it('WITH CHECK: вставка чужого tenant_id из контекста A отвергается', async () => {
    await expect(
      dbService.withTenant(tenantAId, (tx) =>
        tx
          .insert(subsidiary)
          .values({ tenantId: tenantBId, nameI18n: { en: 'Evil' }, code: 'evil' }),
      ),
      // drizzle оборачивает ошибку Postgres — текст политики лежит в cause
    ).rejects.toSatisfy((e: unknown) => {
      const error = e as Error & { cause?: Error };
      return /row-level security/.test(error.cause?.message ?? error.message);
    });
  });
});
