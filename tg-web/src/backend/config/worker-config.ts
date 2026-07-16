import { z } from 'zod';

import type { ServerConfig } from './node-config';

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
    TRADINGVIEW_RAPIDAPI_KEY: z.string().min(1).optional(),
    HYPERDRIVE: requiredBinding,
    CACHE_KV: requiredBinding,
    ASSETS: requiredBinding,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .transform(
    ({
      CORE_API_URL,
      CORE_API_KEY,
      TRADINGVIEW_RAPIDAPI_KEY,
      HYPERDRIVE,
      CACHE_KV,
      ASSETS,
      LOG_LEVEL,
    }): WorkerConfig => ({
      coreApiUrl: new URL(CORE_API_URL),
      coreApiKey: CORE_API_KEY,
      tradingViewRapidApiKey: TRADINGVIEW_RAPIDAPI_KEY,
      hyperdrive: HYPERDRIVE,
      cacheKv: CACHE_KV,
      assets: ASSETS,
      logLevel: LOG_LEVEL,
    }),
  );

export function parseWorkerConfig(env: Record<string, unknown>): WorkerConfig {
  return workerConfigSchema.parse(env);
}
