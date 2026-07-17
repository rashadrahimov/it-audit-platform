/**
 * Конфигурация из env. Дефолты совпадают с docker-compose.yml и .env.example —
 * локальная разработка работает без .env.
 */
export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://audit:audit@localhost:5433/audit',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  s3AccessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  s3SecretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
  s3Bucket: process.env.S3_BUCKET ?? 'audit-files',
  smtpHost: process.env.SMTP_HOST ?? 'localhost',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
};
