import Redis from 'ioredis';

import type { Logger } from '../logging/logger';

const ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Build an ioredis client for the Node cache path.
 * Failures are expected to be fail-open at the Cache layer; this helper only
 * prevents reconnect spam and unhandled `error` events when Redis is down.
 */
export function createRedisClient(redisUrl: string, logger: Logger): Redis {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      return Math.min(times * 200, 5_000);
    },
  });

  let lastErrorLoggedAt = 0;
  client.on('error', (error: Error) => {
    const now = Date.now();
    if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) {
      return;
    }
    lastErrorLoggedAt = now;
    logger.warn('Redis connection error', { error: error.message });
  });

  return client;
}
