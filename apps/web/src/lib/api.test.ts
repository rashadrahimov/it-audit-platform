import { describe, expect, it } from 'vitest';
import { formatHealthLabel } from './api';

describe('formatHealthLabel', () => {
  it('форматирует живой API', () => {
    expect(
      formatHealthLabel({
        status: 'ok',
        service: 'api',
        version: '0.0.1',
        timestamp: new Date().toISOString(),
      }),
    ).toBe('api v0.0.1 — ok');
  });

  it('сообщает о недоступности', () => {
    expect(formatHealthLabel(null)).toBe('API недоступен');
  });
});
