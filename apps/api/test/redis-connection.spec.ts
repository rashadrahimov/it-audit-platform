import { describe, expect, it } from 'vitest';
import { redisConnectionOptions } from '../src/jobs/redis-connection';

describe('redisConnectionOptions', () => {
  it('keeps TLS and credentials for rediss URLs', () => {
    expect(redisConnectionOptions('rediss://default:p%40ss@redis.example.com:6380/2')).toEqual({
      host: 'redis.example.com',
      port: 6380,
      username: 'default',
      password: 'p@ss',
      tls: {},
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it('keeps local redis connections passwordless and without TLS', () => {
    expect(redisConnectionOptions('redis://localhost:6380')).toEqual({
      host: 'localhost',
      port: 6380,
      maxRetriesPerRequest: null,
    });
  });

  it('rejects non-Redis URLs', () => {
    expect(() => redisConnectionOptions('https://redis.example.com')).toThrow(
      'Unsupported Redis protocol',
    );
  });
});
