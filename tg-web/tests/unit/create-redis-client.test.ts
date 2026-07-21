import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRedisClient } from '../../src/backend/cache/create-redis-client';
import { Logger, type LogEntry } from '../../src/backend/logging/logger';

describe('createRedisClient', () => {
  const clients: ReturnType<typeof createRedisClient>[] = [];

  afterEach(async () => {
    await Promise.all(
      clients.splice(0).map(async (client) => {
        client.disconnect();
      }),
    );
  });

  it('handles connection errors without unhandled error events', async () => {
    const entries: LogEntry[] = [];
    const unhandled: Error[] = [];
    const onUnhandled = (error: Error) => {
      unhandled.push(error);
    };
    process.on('uncaughtException', onUnhandled);

    try {
      const client = createRedisClient(
        'redis://127.0.0.1:1',
        new Logger((entry) => entries.push(entry)),
      );
      clients.push(client);

      await expect(client.get('probe')).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(unhandled).toEqual([]);
      expect(entries).toContainEqual({
        level: 'warn',
        message: 'Redis connection error',
        metadata: {
          error: expect.stringMatching(
            /ECONNREFUSED|connect|Connection is closed/,
          ),
        },
      });
    } finally {
      process.off('uncaughtException', onUnhandled);
    }
  });

  it('rate-limits repeated connection error logs', async () => {
    vi.useFakeTimers();
    const entries: LogEntry[] = [];
    const client = createRedisClient(
      'redis://127.0.0.1:1',
      new Logger((entry) => entries.push(entry)),
    );
    clients.push(client);

    client.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:1'));
    client.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:1'));
    expect(entries).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(30_000);
    client.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:1'));
    expect(entries).toHaveLength(2);

    vi.useRealTimers();
  });
});
