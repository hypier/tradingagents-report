import { z } from 'zod';

import { clerkAuthOptionsFromEnv } from '../auth/clerk-auth';
import { isValidBillingEncryptionKey } from '../billing/configuration-store';
import type { ServerConfig } from './node-config';

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const optionalBillingEncryptionKey = optionalSecret.refine(
  (value) => value === undefined || isValidBillingEncryptionKey(value),
  'BILLING_CONFIG_ENCRYPTION_KEY must encode exactly 32 bytes',
);

export type WorkerConfig = ServerConfig & {
  hyperdrive: unknown;
  cacheKv: unknown;
  assets: unknown;
};

const requiredBinding = z.custom<unknown>(
  (value) => value !== undefined && value !== null,
  { message: 'Required' },
);

const workerConfigSchema = z
  .object({
    CORE_API_URL: z.string().url(),
    CORE_API_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    CLERK_AUTHORIZED_PARTIES: z.string().min(1),
    TRADINGVIEW_RAPIDAPI_KEY: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: optionalSecret,
    STRIPE_WEBHOOK_SECRET: optionalSecret,
    BILLING_CONFIG_ENCRYPTION_KEY: optionalBillingEncryptionKey,
    APP_BASE_URL: z.string().url().optional(),
    HYPERDRIVE: requiredBinding,
    CACHE_KV: requiredBinding,
    ASSETS: requiredBinding,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .transform(
    ({
      CORE_API_URL,
      CORE_API_KEY,
      CLERK_SECRET_KEY,
      VITE_CLERK_PUBLISHABLE_KEY,
      CLERK_AUTHORIZED_PARTIES,
      TRADINGVIEW_RAPIDAPI_KEY,
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
      BILLING_CONFIG_ENCRYPTION_KEY,
      APP_BASE_URL,
      HYPERDRIVE,
      CACHE_KV,
      ASSETS,
      LOG_LEVEL,
    }): WorkerConfig => {
      const clerkAuth = clerkAuthOptionsFromEnv({
        CLERK_SECRET_KEY,
        VITE_CLERK_PUBLISHABLE_KEY,
        CLERK_AUTHORIZED_PARTIES,
      });
      return {
        clerkAuth,
        billing: {
          secretKey: STRIPE_SECRET_KEY,
          webhookSecret: STRIPE_WEBHOOK_SECRET,
          appBaseUrl: new URL(APP_BASE_URL ?? clerkAuth.authorizedParties[0]!),
        },
        billingConfigEncryptionKey: BILLING_CONFIG_ENCRYPTION_KEY,
        coreApiUrl: new URL(CORE_API_URL),
        coreApiKey: CORE_API_KEY,
        tradingViewRapidApiKey: TRADINGVIEW_RAPIDAPI_KEY,
        hyperdrive: HYPERDRIVE,
        cacheKv: CACHE_KV,
        assets: ASSETS,
        logLevel: LOG_LEVEL,
      };
    },
  );

export function parseWorkerConfig(env: Record<string, unknown>): WorkerConfig {
  return workerConfigSchema.parse(env);
}
