import { z } from 'zod';

export type ServerConfig = {
  coreApiUrl: URL;
  coreApiKey: string;
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

const nodeConfigSchema = z
  .object({
    CORE_API_URL: z.string().url(),
    CORE_API_KEY: z.string().min(1),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    PORT: z.coerce.number().int().min(1).max(65535),
    LOG_LEVEL: logLevelSchema,
  })
  .transform(
    ({
      CORE_API_URL,
      CORE_API_KEY,
      DATABASE_URL,
      REDIS_URL,
      PORT,
      LOG_LEVEL,
    }): NodeConfig => ({
      coreApiUrl: new URL(CORE_API_URL),
      coreApiKey: CORE_API_KEY,
      databaseUrl: new URL(DATABASE_URL),
      redisUrl: new URL(REDIS_URL),
      port: PORT,
      logLevel: LOG_LEVEL,
    }),
  );

export function parseNodeConfig(env: Record<string, unknown>): NodeConfig {
  return nodeConfigSchema.parse(env);
}
