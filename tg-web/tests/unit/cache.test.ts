import { describe, expect, it, vi } from 'vitest';

import { exerciseCacheContract } from '../../src/backend/cache/contract';
import { KvCache, type KvNamespace } from '../../src/backend/cache/kv-cache';
import { Logger, type LogEntry } from '../../src/backend/logging/logger';

function createKvNamespace(): KvNamespace {
  const values = new Map<string, string>();

  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

describe('cache adapters', () => {
  it('requires cache adapters to support get, TTL set, and delete', async () => {
    await exerciseCacheContract(new KvCache(createKvNamespace(), new Logger()));
  });

  it('uses Cloudflare KV expirationTtl when setting a value', async () => {
    const put = vi.fn(async () => undefined);
    const namespace: KvNamespace = {
      get: async () => null,
      put,
      delete: async () => undefined,
    };
    const cache = new KvCache(namespace, new Logger());

    await cache.set('ticker:NVDA', 'value', 60);

    expect(put).toHaveBeenCalledWith('ticker:NVDA', 'value', {
      expirationTtl: 60,
    });
  });

  it('checks KV health with a fixed read and no write', async () => {
    const get = vi.fn(async () => null);
    const put = vi.fn(async () => undefined);
    const namespace: KvNamespace = {
      get,
      put,
      delete: async () => undefined,
    };
    const cache = new KvCache(namespace, new Logger());

    await expect(cache.healthcheck()).resolves.toBeUndefined();

    expect(get).toHaveBeenCalledWith('__cache_healthcheck__');
    expect(put).not.toHaveBeenCalled();
  });

  it('logs KV failures without leaking the cached value and rethrows them', async () => {
    const entries: LogEntry[] = [];
    const cachedValue = 'do-not-log-this-value';
    const failure = new Error(`get failed for ${cachedValue}`);
    const namespace: KvNamespace = {
      get: async () => {
        throw failure;
      },
      put: async () => undefined,
      delete: async () => undefined,
    };
    const cache = new KvCache(
      namespace,
      new Logger((entry) => entries.push(entry)),
    );

    await expect(cache.get('ticker:NVDA')).rejects.toBe(failure);

    expect(entries).toEqual([
      {
        level: 'error',
        message: 'KV cache get failed',
        metadata: { key: 'ticker:NVDA' },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain(cachedValue);
  });
});
