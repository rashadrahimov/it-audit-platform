import { z } from 'zod';

/**
 * Контракты /jobs — фоновые задачи BullMQ (T-040): демо отложенной задачи
 * и heartbeat планировщика.
 */
export const demoJobEnqueuedSchema = z.object({
  id: z.string(),
  delayMs: z.number().int().nonnegative(),
});

export const demoJobStatusSchema = z.object({
  id: z.string(),
  state: z.enum(['waiting', 'delayed', 'prioritized', 'active', 'completed', 'failed', 'unknown']),
  returnValue: z.string().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export const heartbeatStatusSchema = z.object({
  lastRunAt: z.iso.datetime().nullable(),
});

export type DemoJobEnqueued = z.infer<typeof demoJobEnqueuedSchema>;
export type DemoJobStatus = z.infer<typeof demoJobStatusSchema>;
export type HeartbeatStatus = z.infer<typeof heartbeatStatusSchema>;
