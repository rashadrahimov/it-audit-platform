import { Injectable } from '@nestjs/common';
import { Socket } from 'node:net';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { InfraHealthResponse, InfraServiceCheck } from '@it-audit/shared';

/** Дефолты совпадают с docker-compose.yml и .env.example — работает без .env. */
const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://audit:audit@localhost:5433/audit',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  s3AccessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  s3SecretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
  s3Bucket: process.env.S3_BUCKET ?? 'audit-files',
  smtpHost: process.env.SMTP_HOST ?? 'localhost',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
};

const CHECK_TIMEOUT_MS = 3000;

async function runCheck(check: () => Promise<void>): Promise<InfraServiceCheck> {
  const startedAt = performance.now();
  try {
    await check();
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

@Injectable()
export class InfraHealthService {
  async check(): Promise<InfraHealthResponse> {
    const [postgres, redis, s3, smtp] = await Promise.all([
      runCheck(() => this.checkPostgres()),
      runCheck(() => this.checkRedis()),
      runCheck(() => this.checkS3()),
      runCheck(() => this.checkSmtp()),
    ]);
    const services = { postgres, redis, s3, smtp };
    return {
      status: Object.values(services).every((s) => s.ok) ? 'ok' : 'degraded',
      services,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkPostgres(): Promise<void> {
    const client = new Client({
      connectionString: env.databaseUrl,
      connectionTimeoutMillis: CHECK_TIMEOUT_MS,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end().catch(() => {});
    }
  }

  private async checkRedis(): Promise<void> {
    const redis = new Redis(env.redisUrl, {
      connectTimeout: CHECK_TIMEOUT_MS,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    try {
      await redis.connect();
      await redis.ping();
    } finally {
      redis.disconnect();
    }
  }

  /** HeadBucket проверяет всю цепочку: endpoint, креды, существование бакета. */
  private async checkS3(): Promise<void> {
    const s3 = new S3Client({
      endpoint: env.s3Endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
    });
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
    } finally {
      s3.destroy();
    }
  }

  /** SMTP-хендшейк не нужен: достаточно приветствия сервера «220 …». */
  private checkSmtp(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      socket.setTimeout(CHECK_TIMEOUT_MS, () => fail(new Error('SMTP: таймаут соединения')));
      socket.once('error', fail);
      socket.connect(env.smtpPort, env.smtpHost);
      socket.once('data', (greeting) => {
        socket.end();
        if (greeting.toString().startsWith('220')) resolve();
        else fail(new Error(`SMTP: неожиданное приветствие «${greeting.toString().trim()}»`));
      });
    });
  }
}
