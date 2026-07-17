import { z } from 'zod';

/**
 * Контракт GET /health — первый сквозной тип api ↔ web.
 * Схемы shared — источник правды для DTO обеих сторон (ADR-0018).
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
