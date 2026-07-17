/**
 * Идемпотентный seed демо-данных (T-007). Запуск: `pnpm seed` из корня
 * (после `pnpm build`) — или `node dist/seed.js` из apps/api.
 *
 * Доменной схемы ещё нет (появится в T-010, миграции по data-model.md) —
 * пока seed гарантирует S3-бакет, кладёт демо-файл и проверяет Postgres/Redis.
 * По мере роста схемы сюда добавляются доменные сид-данные.
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import { env } from './env';

const DEMO_OBJECT_KEY = 'demo/welcome.txt';

async function seedPostgres(): Promise<void> {
  const client = new Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    console.log('✓ Postgres доступен; доменных таблиц ещё нет (T-010) — сидить нечего');
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
