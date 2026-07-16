/// <reference types="@cloudflare/workers-types" />

import { createApp, type AppDependencies, type AppType } from '../backend/app';
import { FailOpenCache } from '../backend/cache/fail-open-cache';
import { KvCache } from '../backend/cache/kv-cache';
import { parseWorkerConfig } from '../backend/config/worker-config';
import { CoreClient } from '../backend/core/client';
import { createWorkerDatabase } from '../backend/database/client';
import { Logger } from '../backend/logging/logger';
import { TradingViewMarketClient } from '../backend/market-assets/tradingview-market-client';

export interface WorkerEnv {
  ASSETS: Fetcher;
  CACHE_KV: KVNamespace;
  HYPERDRIVE: Hyperdrive;
  CORE_API_URL: string;
  CORE_API_KEY: string;
  TRADINGVIEW_RAPIDAPI_KEY?: string;
  LOG_LEVEL?: string;
}

export type WorkerDependenciesFactory = (env: WorkerEnv) => AppDependencies;
export type WorkerHandler = {
  fetch: NonNullable<ExportedHandler<WorkerEnv>['fetch']>;
};

function createDependencies(env: WorkerEnv): AppDependencies {
  const config = parseWorkerConfig(env as unknown as Record<string, unknown>);
  const logger = new Logger();

  return {
    database: createWorkerDatabase(env.HYPERDRIVE.connectionString),
    cache: new FailOpenCache(new KvCache(env.CACHE_KV, logger), logger),
    core: new CoreClient(config.coreApiUrl, config.coreApiKey),
    marketAssets: new TradingViewMarketClient(config.tradingViewRapidApiKey),
    logger,
  };
}

export function createWorkerHandler(
  dependencyFactory: WorkerDependenciesFactory = createDependencies,
): WorkerHandler {
  const apps = new WeakMap<WorkerEnv, AppType>();

  return {
    fetch(request, env, ctx) {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        let app = apps.get(env);
        if (app === undefined) {
          app = createApp(dependencyFactory(env));
          apps.set(env, app);
        }
        return app.fetch(request, env, ctx);
      }

      return env.ASSETS.fetch(request).then((response) =>
        response.status === 404
          ? env.ASSETS.fetch(new Request(new URL('/index.html', request.url)))
          : response,
      );
    },
  };
}

export default createWorkerHandler();
