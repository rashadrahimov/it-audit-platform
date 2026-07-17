import { z } from 'zod';

/**
 * Контракт GET /health/infra — доступность инфраструктуры docker-compose (T-006):
 * Postgres, Redis, MinIO (S3), Mailpit (SMTP).
 */
export const infraServiceCheckSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional(),
});

export const infraHealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  services: z.object({
    postgres: infraServiceCheckSchema,
    redis: infraServiceCheckSchema,
    s3: infraServiceCheckSchema,
    smtp: infraServiceCheckSchema,
  }),
  timestamp: z.iso.datetime(),
});

export type InfraServiceCheck = z.infer<typeof infraServiceCheckSchema>;
export type InfraHealthResponse = z.infer<typeof infraHealthResponseSchema>;
