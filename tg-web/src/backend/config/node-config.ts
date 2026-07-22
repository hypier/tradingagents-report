import { z } from 'zod';

import {
  clerkAuthOptionsFromEnv,
  type ClerkAuthOptions,
} from '../auth/clerk-auth';
import type { StripeBillingOptions } from '../billing/stripe-billing';
import { isValidLlmEncryptionKey } from '../llm/provider-secrets';

export type ServerConfig = {
  clerkAuth: ClerkAuthOptions;
  billing: StripeBillingOptions;
  billingConfigEncryptionKey?: string;
  coreApiUrl: URL;
  coreApiKey: string;
  tradingViewRapidApiKey?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

export type NodeConfig = ServerConfig & {
  databaseUrl: URL;
  redisUrl: URL;
  port: number;
};

const logLevelSchema = z
  .enum(['debug', 'info', 'warn', 'error'])
  .default('info');

const CORE_API_KEY_PLACEHOLDER = 'replace-with-a-core-api-key';
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const optionalBillingEncryptionKey = optionalSecret.refine(
  (value) => value === undefined || isValidLlmEncryptionKey(value),
  'BILLING_CONFIG_ENCRYPTION_KEY must encode exactly 32 bytes',
);

const nodeConfigSchema = z
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
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    PORT: z.coerce.number().int().min(1).max(65535),
    LOG_LEVEL: logLevelSchema,
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
      DATABASE_URL,
      REDIS_URL,
      PORT,
      LOG_LEVEL,
    }): NodeConfig => {
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
        databaseUrl: new URL(DATABASE_URL),
        redisUrl: new URL(REDIS_URL),
        port: PORT,
        logLevel: LOG_LEVEL,
      };
    },
  );

export function parseNodeConfig(env: Record<string, unknown>): NodeConfig {
  const configuredCoreApiKey = env.CORE_API_KEY;
  const coreApiKey =
    configuredCoreApiKey === CORE_API_KEY_PLACEHOLDER ||
    configuredCoreApiKey === ''
      ? env.TRADINGAGENTS_API_KEY
      : configuredCoreApiKey;

  return nodeConfigSchema.parse({ ...env, CORE_API_KEY: coreApiKey });
}
