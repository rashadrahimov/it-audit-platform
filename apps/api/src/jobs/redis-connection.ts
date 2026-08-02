import type { RedisOptions } from 'ioredis';

/** Preserve authentication and TLS when BullMQ receives a Redis URL. */
export function redisConnectionOptions(rawUrl: string): RedisOptions {
  const url = new URL(rawUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(`Unsupported Redis protocol: ${url.protocol}`);
  }

  const port = Number(url.port || '6379');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid Redis port: ${url.port}`);
  }

  const options: RedisOptions = {
    host: url.hostname,
    port,
    maxRetriesPerRequest: null,
  };

  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === 'rediss:') options.tls = {};

  const database = url.pathname.slice(1);
  if (database) {
    const db = Number(database);
    if (!Number.isInteger(db) || db < 0) throw new Error(`Invalid Redis database: ${database}`);
    options.db = db;
  }

  return options;
}
