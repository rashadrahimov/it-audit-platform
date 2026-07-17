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
import { and, eq } from 'drizzle-orm';
import { env } from './env';
import { subsidiary, tenant } from './db/schema';

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

    const existing = await db
      .select()
      .from(subsidiary)
      .where(and(eq(subsidiary.tenantId, demoTenant.id), eq(subsidiary.code, 'demo-bank')));
    if (existing.length === 0) {
      await db.insert(subsidiary).values({
        tenantId: demoTenant.id,
        code: 'demo-bank',
        nameI18n: { en: 'Demo Bank', az: 'Demo Bank', ru: 'Демо-банк' },
        country: 'AZ',
        businessProfile: { segment: 'banking' },
      });
    }
    console.log('✓ Subsidiary «Demo Bank» (code: demo-bank)');
  } finally {
    await client.end().catch(() => {});
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
