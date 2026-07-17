import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@it-audit/shared';
import { HealthController } from '../src/health.controller';

describe('HealthController', () => {
  it('отдаёт ответ, соответствующий shared-контракту', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const response = controller.health();

    expect(() => healthResponseSchema.parse(response)).not.toThrow();
    expect(response.service).toBe('api');
  });
});
