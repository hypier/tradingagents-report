import { z } from 'zod';

export type ServerConfig = {
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

const nodeConfigSchema = z
  .object({
    CORE_API_URL: z.string().url(),
    CORE_API_KEY: z.string().min(1),
    TRADINGVIEW_RAPIDAPI_KEY: z.string().min(1).optional(),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    PORT: z.coerce.number().int().min(1).max(65535),
    LOG_LEVEL: logLevelSchema,
  })
  .transform(
    ({
      CORE_API_URL,
      CORE_API_KEY,
      TRADINGVIEW_RAPIDAPI_KEY,
      DATABASE_URL,
      REDIS_URL,
      PORT,
      LOG_LEVEL,
    }): NodeConfig => ({
      coreApiUrl: new URL(CORE_API_URL),
      coreApiKey: CORE_API_KEY,
      tradingViewRapidApiKey: TRADINGVIEW_RAPIDAPI_KEY,
      databaseUrl: new URL(DATABASE_URL),
      redisUrl: new URL(REDIS_URL),
      port: PORT,
      logLevel: LOG_LEVEL,
    }),
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
