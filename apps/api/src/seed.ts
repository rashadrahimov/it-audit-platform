/**
 * Идемпотентный seed демо-данных (T-007). Запуск: `pnpm seed` из корня
 * (после `pnpm build` и `pnpm db:migrate`) — или `node dist/seed.js` из apps/api.
 *
 * Гарантирует S3-бакет с демо-файлом и сидит доменные данные (T-010+):
 * демо-tenant «demo» с одной дочкой. Растёт вместе со схемой.
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql } from 'drizzle-orm';
import { env } from './env';
import { permission, role, rolePermission, subsidiary, tenant } from './db/schema';

const DEMO_OBJECT_KEY = 'demo/welcome.txt';
const DEMO_TENANT_SLUG = 'demo';

async function seedPostgres(): Promise<void> {
  const client = new Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const db = drizzle(client);

    await db
      .insert(tenant)
      .values({ slug: DEMO_TENANT_SLUG, name: 'Demo Group', languageDefault: 'en' })
      .onConflictDoNothing({ target: tenant.slug });
    const [demoTenant] = await db.select().from(tenant).where(eq(tenant.slug, DEMO_TENANT_SLUG));
    if (!demoTenant) throw new Error(`Tenant «${DEMO_TENANT_SLUG}» не найден после вставки`);
    console.log(`✓ Tenant «${demoTenant.name}» (${demoTenant.id})`);

    // subsidiary под RLS (T-011): любые чтения/записи — только с контекстом тенанта
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenant.id}, true)`);
      const existing = await tx
        .select()
        .from(subsidiary)
        .where(and(eq(subsidiary.tenantId, demoTenant.id), eq(subsidiary.code, 'demo-bank')));
      if (existing.length === 0) {
        await tx.insert(subsidiary).values({
          tenantId: demoTenant.id,
          code: 'demo-bank',
          nameI18n: { en: 'Demo Bank', az: 'Demo Bank', ru: 'Демо-банк' },
          country: 'AZ',
          businessProfile: { segment: 'banking' },
        });
      }
    });
    console.log('✓ Subsidiary «Demo Bank» (code: demo-bank)');

    // RBAC (T-018): глобальный каталог прав (без RLS) + демо-роль тенанта с матрицей
    const RESOURCES = ['engagement', 'finding', 'control', 'report', 'settings'];
    const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'];
    await db
      .insert(permission)
      .values(RESOURCES.flatMap((resource) => ACTIONS.map((action) => ({ resource, action }))))
      .onConflictDoNothing();
    const catalog = await db.select().from(permission);
    console.log(`✓ Каталог прав: ${catalog.length} permission'ов`);

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenant.id}, true)`);
      const roles = await tx.select().from(role).where(eq(role.tenantId, demoTenant.id));
      if (roles.length === 0) {
        const [demoRole] = await tx
          .insert(role)
          .values({
            tenantId: demoTenant.id,
            nameI18n: { en: 'Demo Auditors', az: 'Demo Auditorlar', ru: 'Демо-аудиторы' },
          })
          .returning();
        if (!demoRole) throw new Error('Демо-роль не создалась');
        await tx.insert(rolePermission).values(
          catalog.map((p) => ({
            roleId: demoRole.id,
            permissionId: p.id,
            level: ['engagement', 'finding'].includes(p.resource) ? 'edit' : 'view',
          })),
        );
      }
    });
    console.log('✓ Роль «Демо-аудиторы» с матрицей (edit: engagement/finding, view: остальное)');
    await seedPresetRoles(catalog);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Системные пресет-роли (T-019): tenant_id NULL — вставка обходит RLS-политику
 * записи, поэтому идёт под владельцем схемы (DATABASE_URL_OWNER), как миграции.
 * Категории membership (auditor/end user/MSP) появятся вместе с таблицей membership.
 */
const PRESET_ROLES: Array<{
  name: { en: string; az: string; ru: string };
  level: (resource: string, action: string) => 'none' | 'view' | 'edit';
}> = [
  { name: { en: 'Admin', az: 'Admin', ru: 'Администратор' }, level: () => 'edit' },
  {
    name: { en: 'View-only Admin', az: 'Baxış Admini', ru: 'Админ (только чтение)' },
    level: () => 'view',
  },
  {
    name: { en: 'Editor', az: 'Redaktor', ru: 'Редактор' },
    level: (resource) => (resource === 'settings' ? 'view' : 'edit'),
  },
  {
    name: { en: 'Collaborator', az: 'Əməkdaş', ru: 'Участник' },
    level: (resource) =>
      resource === 'finding' ? 'edit' : resource === 'settings' ? 'none' : 'view',
  },
  {
    name: { en: 'Assessor', az: 'Qiymətləndirici', ru: 'Ассессор' },
    level: (resource) =>
      ['engagement', 'finding'].includes(resource)
        ? 'edit'
        : resource === 'settings'
          ? 'none'
          : 'view',
  },
  {
    name: { en: 'Manager', az: 'Menecer', ru: 'Менеджер' },
    level: (resource) => (['engagement', 'finding', 'report'].includes(resource) ? 'edit' : 'view'),
  },
  {
    name: { en: 'Approver', az: 'Təsdiqləyici', ru: 'Утверждающий' },
    level: (resource, action) => (action === 'approve' ? 'edit' : 'view'),
  },
];

async function seedPresetRoles(catalog: (typeof permission.$inferSelect)[]): Promise<void> {
  const owner = new Client({
    connectionString: env.databaseUrlOwner,
    connectionTimeoutMillis: 5000,
  });
  try {
    await owner.connect();
    const db = drizzle(owner);
    const existing = await db.select().from(role).where(eq(role.isSystem, true));
    const existingNames = new Set(existing.map((r) => r.nameI18n.en));
    for (const preset of PRESET_ROLES) {
      if (existingNames.has(preset.name.en)) continue;
      const [created] = await db
        .insert(role)
        .values({ tenantId: null, nameI18n: preset.name, isSystem: true })
        .returning();
      if (!created) throw new Error(`Пресет «${preset.name.en}» не создался`);
      await db.insert(rolePermission).values(
        catalog.map((p) => ({
          roleId: created.id,
          permissionId: p.id,
          level: preset.level(p.resource, p.action),
        })),
      );
    }
    console.log(`✓ Системные пресет-роли: ${PRESET_ROLES.length} (idempotent)`);
  } finally {
    await owner.end().catch(() => {});
  }
}

async function seedRedis(): Promise<void> {
  const redis = new Redis(env.redisUrl, {
    connectTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.ping();
    console.log('✓ Redis доступен');
  } finally {
    redis.disconnect();
  }
}

async function seedS3(): Promise<void> {
  const s3 = new S3Client({
    endpoint: env.s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  });
  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
      console.log(`✓ Бакет ${env.s3Bucket} уже есть`);
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: env.s3Bucket }));
      console.log(`✓ Бакет ${env.s3Bucket} создан`);
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: DEMO_OBJECT_KEY,
        Body: `IT Audit Platform — демо-файл seed'а.\nПерезаписывается при каждом прогоне: ${new Date().toISOString()}\n`,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
    console.log(`✓ Демо-файл ${DEMO_OBJECT_KEY} загружен`);
  } finally {
    s3.destroy();
  }
}

async function main(): Promise<void> {
  console.log('Seed: инфраструктура docker-compose должна быть поднята (pnpm infra:up)');
  await Promise.all([seedPostgres(), seedRedis(), seedS3()]);
  console.log('Seed завершён.');
}

main().catch((error) => {
  console.error('Seed провалился:', error instanceof Error ? error.message : error);
  process.exit(1);
});
