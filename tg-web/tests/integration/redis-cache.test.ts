import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exerciseCacheContract } from '../../src/backend/cache/contract';
import { RedisCache } from '../../src/backend/cache/redis-cache';
import { Logger } from '../../src/backend/logging/logger';

describe('RedisCache', () => {
  let container: StartedTestContainer | undefined;
  let client: Redis | undefined;
  let cache: RedisCache;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    client = new Redis(
      `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    );
    cache = new RedisCache(client, new Logger());
  });

  afterAll(async () => {
    await client?.quit();
    await container?.stop();
  });

  it('supports the cache contract', async () => {
    await exerciseCacheContract(cache);
    await expect(cache.healthcheck()).resolves.toBeUndefined();
  });
});
