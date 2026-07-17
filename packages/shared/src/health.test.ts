import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  it('принимает корректный ответ', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
    });
    expect(parsed.status).toBe('ok');
  });

  it('отклоняет неизвестный статус', () => {
    const result = healthResponseSchema.safeParse({
      status: 'down',
      service: 'api',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
