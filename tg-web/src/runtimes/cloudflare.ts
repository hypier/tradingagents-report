/// <reference types="@cloudflare/workers-types" />

import { createApp, type AppDependencies } from '../backend/app';
import { KvCache } from '../backend/cache/kv-cache';
import { parseWorkerConfig } from '../backend/config/worker-config';
import { CoreClient } from '../backend/core/client';
import { createWorkerDatabase } from '../backend/database/client';
import { Logger } from '../backend/logging/logger';

export interface WorkerEnv {
  ASSETS: Fetcher;
  CACHE_KV: KVNamespace;
  HYPERDRIVE: Hyperdrive;
  CORE_API_URL: string;
  CORE_API_KEY: string;
  LOG_LEVEL?: string;
}

function createDependencies(env: WorkerEnv): AppDependencies {
  const config = parseWorkerConfig(env as unknown as Record<string, unknown>);
  const logger = new Logger();

  return {
    database: createWorkerDatabase(env.HYPERDRIVE.connectionString),
    cache: new KvCache(env.CACHE_KV, logger),
    core: new CoreClient(config.coreApiUrl, config.coreApiKey),
    logger,
  };
}

export default {
  fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return createApp(createDependencies(env)).fetch(request, env, ctx);
    }

    return env.ASSETS.fetch(request).then((response) =>
      response.status === 404
        ? env.ASSETS.fetch(new Request(new URL('/index.html', request.url)))
        : response,
    );
  },
} satisfies ExportedHandler<WorkerEnv>;
