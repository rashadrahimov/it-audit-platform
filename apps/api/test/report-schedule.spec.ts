import { describe, expect, it } from 'vitest';
import { nextDigestRunAtForSettings } from '../src/reports-export/reports-export.service';

const base = {
  emailEnabled: true,
  schedule: 'anytime' as const,
  timezone: 'UTC',
};

describe('scheduled report digest preview', () => {
  it('estimates the next monthly digest for the first day at 09:00 UTC', () => {
    expect(
      nextDigestRunAtForSettings(
        { ...base, digest: 'monthly' },
        new Date('2026-07-22T09:30:00.000Z'),
      ),
    ).toBe('2026-08-01T09:00:00.000Z');

    expect(
      nextDigestRunAtForSettings(
        { ...base, digest: 'monthly' },
        new Date('2026-08-01T08:30:00.000Z'),
      ),
    ).toBe('2026-08-01T09:00:00.000Z');
  });

  it('keeps weekly and disabled schedule behavior intact', () => {
    expect(
      nextDigestRunAtForSettings(
        { ...base, digest: 'weekly' },
        new Date('2026-07-22T09:30:00.000Z'),
      ),
    ).toBe('2026-07-27T09:00:00.000Z');
    expect(
      nextDigestRunAtForSettings(
        { ...base, emailEnabled: false, digest: 'monthly' },
        new Date('2026-07-22T09:30:00.000Z'),
      ),
    ).toBeNull();
  });
});
