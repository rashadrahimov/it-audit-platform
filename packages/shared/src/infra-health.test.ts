import { describe, expect, it } from 'vitest';
import { infraHealthResponseSchema } from './infra-health';

const check = { ok: true, latencyMs: 12 };

describe('infraHealthResponseSchema', () => {
  it('принимает корректный ответ', () => {
    const parsed = infraHealthResponseSchema.parse({
      status: 'ok',
      services: { postgres: check, redis: check, s3: check, smtp: check },
      timestamp: new Date().toISOString(),
    });
    expect(parsed.services.postgres.ok).toBe(true);
  });

  it('отклоняет ответ без одного из сервисов', () => {
    const result = infraHealthResponseSchema.safeParse({
      status: 'ok',
      services: { postgres: check, redis: check, s3: check },
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
