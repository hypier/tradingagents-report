import { describe, expect, it } from 'vitest';

import { parseNodeConfig } from '../../src/backend/config/node-config';
import { parseWorkerConfig } from '../../src/backend/config/worker-config';

const nodeEnv = {
  CORE_API_URL: 'https://core.example.test',
  CORE_API_KEY: 'secret',
  DATABASE_URL: 'postgresql://user:password@db.example.test:5432/tg',
  REDIS_URL: 'redis://127.0.0.1:6379',
  PORT: '8787',
};

describe('parseNodeConfig', () => {
  it('rejects an invalid database URL', () => {
    expect(() =>
      parseNodeConfig({
        ...nodeEnv,
        DATABASE_URL: 'not-a-url',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('validates required values and applies the default log level', () => {
    expect(parseNodeConfig(nodeEnv)).toMatchObject({
      coreApiUrl: new URL('https://core.example.test'),
      coreApiKey: 'secret',
      databaseUrl: new URL(
        'postgresql://user:password@db.example.test:5432/tg',
      ),
      redisUrl: new URL('redis://127.0.0.1:6379'),
      port: 8787,
      logLevel: 'info',
    });
  });

  it('rejects ports outside the valid TCP range', () => {
    expect(() => parseNodeConfig({ ...nodeEnv, PORT: '65536' })).toThrow(
      /PORT/,
    );
  });
});

describe('parseWorkerConfig', () => {
  it('requires every Worker binding', () => {
    expect(() =>
      parseWorkerConfig({
        CORE_API_URL: 'https://core.example.test',
        CORE_API_KEY: 'secret',
        HYPERDRIVE: {},
        CACHE_KV: {},
      }),
    ).toThrow(/ASSETS/);
  });

  it('returns validated server settings and bindings', () => {
    const env = {
      CORE_API_URL: 'https://core.example.test',
      CORE_API_KEY: 'secret',
      HYPERDRIVE: { connectionString: 'postgresql://db.example.test/tg' },
      CACHE_KV: { get: () => undefined },
      ASSETS: { fetch: () => new Response() },
      LOG_LEVEL: 'warn',
    };

    expect(parseWorkerConfig(env)).toMatchObject({
      coreApiUrl: new URL('https://core.example.test'),
      coreApiKey: 'secret',
      hyperdrive: env.HYPERDRIVE,
      cacheKv: env.CACHE_KV,
      assets: env.ASSETS,
      logLevel: 'warn',
    });
  });
});
