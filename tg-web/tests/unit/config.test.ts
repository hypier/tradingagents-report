import { describe, expect, it } from 'vitest';

import { parseNodeConfig } from '../../src/backend/config/node-config';
import { parseWorkerConfig } from '../../src/backend/config/worker-config';

const nodeEnv = {
  CLERK_SECRET_KEY: 'sk_test_secret',
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
  CLERK_AUTHORIZED_PARTIES: 'http://localhost:5173, https://app.example.test',
  CORE_API_URL: 'https://core.example.test',
  CORE_API_KEY: 'secret',
  DATABASE_URL: 'postgresql://user:password@db.example.test:5432/tg',
  REDIS_URL: 'redis://127.0.0.1:6379',
  PORT: '8787',
};
const billingEncryptionKey = btoa('01234567890123456789012345678901');

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
      clerkAuth: {
        secretKey: 'sk_test_secret',
        publishableKey: 'pk_test_public',
        authorizedParties: [
          'http://localhost:5173',
          'https://app.example.test',
        ],
      },
      billing: {
        appBaseUrl: new URL('http://localhost:5173'),
      },
      databaseUrl: new URL(
        'postgresql://user:password@db.example.test:5432/tg',
      ),
      redisUrl: new URL('redis://127.0.0.1:6379'),
      port: 8787,
      logLevel: 'info',
    });
  });

  it('uses the Core token when the local API key is still a template placeholder', () => {
    expect(
      parseNodeConfig({
        ...nodeEnv,
        CORE_API_KEY: 'replace-with-a-core-api-key',
        TRADINGAGENTS_API_KEY: 'core-secret',
      }).coreApiKey,
    ).toBe('core-secret');
  });

  it('rejects ports outside the valid TCP range', () => {
    expect(() => parseNodeConfig({ ...nodeEnv, PORT: '65536' })).toThrow(
      /PORT/,
    );
  });

  it('rejects Clerk authorized parties that are not HTTP origins', () => {
    expect(() =>
      parseNodeConfig({
        ...nodeEnv,
        CLERK_AUTHORIZED_PARTIES: 'https://app.example.test/path',
      }),
    ).toThrow(/HTTP\(S\) origins/);
  });

  it('parses optional Stripe secrets and an explicit public base URL', () => {
    expect(
      parseNodeConfig({
        ...nodeEnv,
        STRIPE_SECRET_KEY: 'sk_test_stripe',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        APP_BASE_URL: 'https://billing.example.test',
      }).billing,
    ).toEqual({
      secretKey: 'sk_test_stripe',
      webhookSecret: 'whsec_test',
      appBaseUrl: new URL('https://billing.example.test'),
    });
  });

  it('validates the billing configuration encryption key', () => {
    expect(
      parseNodeConfig({
        ...nodeEnv,
        BILLING_CONFIG_ENCRYPTION_KEY: billingEncryptionKey,
      }).billingConfigEncryptionKey,
    ).toBe(billingEncryptionKey);
    expect(() =>
      parseNodeConfig({
        ...nodeEnv,
        BILLING_CONFIG_ENCRYPTION_KEY: btoa('too-short'),
      }),
    ).toThrow(/BILLING_CONFIG_ENCRYPTION_KEY/);
  });
});

describe('parseWorkerConfig', () => {
  it('requires every Worker binding', () => {
    expect(() =>
      parseWorkerConfig({
        CLERK_SECRET_KEY: 'sk_test_secret',
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
        CLERK_AUTHORIZED_PARTIES: 'https://app.example.test',
        CORE_API_URL: 'https://core.example.test',
        CORE_API_KEY: 'secret',
        HYPERDRIVE: {},
        CACHE_KV: {},
      }),
    ).toThrow(/ASSETS/);
  });

  it.each(['HYPERDRIVE', 'CACHE_KV', 'ASSETS'] as const)(
    'rejects a null %s binding',
    (binding) => {
      const env = {
        CLERK_SECRET_KEY: 'sk_test_secret',
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
        CLERK_AUTHORIZED_PARTIES: 'https://app.example.test',
        CORE_API_URL: 'https://core.example.test',
        CORE_API_KEY: 'secret',
        HYPERDRIVE: {},
        CACHE_KV: {},
        ASSETS: {},
        [binding]: null,
      };

      expect(() => parseWorkerConfig(env)).toThrow(new RegExp(binding));
    },
  );

  it('returns validated server settings and bindings', () => {
    const env = {
      CLERK_SECRET_KEY: 'sk_test_secret',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
      CLERK_AUTHORIZED_PARTIES: 'https://app.example.test',
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
      clerkAuth: {
        secretKey: 'sk_test_secret',
        publishableKey: 'pk_test_public',
        authorizedParties: ['https://app.example.test'],
      },
      billing: {
        appBaseUrl: new URL('https://app.example.test'),
      },
      hyperdrive: env.HYPERDRIVE,
      cacheKv: env.CACHE_KV,
      assets: env.ASSETS,
      logLevel: 'warn',
    });
  });
});
