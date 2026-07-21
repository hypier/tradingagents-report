/// <reference types="@cloudflare/workers-types" />

import { createApp, type AppDependencies, type AppType } from '../backend/app';
import { createClerkAuthService } from '../backend/auth/clerk-auth';
import { createBillingConfigurationStore } from '../backend/billing/configuration-store';
import { createManagedStripeBillingService } from '../backend/billing/managed-stripe-billing';
import { FailOpenCache } from '../backend/cache/fail-open-cache';
import { KvCache } from '../backend/cache/kv-cache';
import { parseWorkerConfig } from '../backend/config/worker-config';
import { CoreClient } from '../backend/core/client';
import { createWorkerDatabase } from '../backend/database/client';
import { Logger } from '../backend/logging/logger';
import { CachingMarketAssetClient } from '../backend/market-assets/caching-market-client';
import { TradingViewMarketClient } from '../backend/market-assets/tradingview-market-client';

export interface WorkerEnv {
  ASSETS: Fetcher;
  CACHE_KV: KVNamespace;
  HYPERDRIVE: Hyperdrive;
  CORE_API_URL: string;
  CORE_API_KEY: string;
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  BILLING_CONFIG_ENCRYPTION_KEY?: string;
  APP_BASE_URL?: string;
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
  const database = createWorkerDatabase(env.HYPERDRIVE.connectionString);
  const core = new CoreClient(config.coreApiUrl, config.coreApiKey);
  const cache = new FailOpenCache(new KvCache(env.CACHE_KV, logger), logger);

  return {
    auth: createClerkAuthService(config.clerkAuth),
    billing: createManagedStripeBillingService({
      ...config.billing,
      configurationStore: createBillingConfigurationStore(
        database.billingConfig,
        config.billingConfigEncryptionKey,
      ),
    }),
    database,
    cache,
    core,
    marketAssets: new CachingMarketAssetClient(
      new TradingViewMarketClient(config.tradingViewRapidApiKey),
      cache,
    ),
    logger,
    clerkPublishableKey: config.clerkAuth.publishableKey,
  };
}

export function createWorkerHandler(
  dependencyFactory: WorkerDependenciesFactory = createDependencies,
): WorkerHandler {
  const apps = new WeakMap<WorkerEnv, AppType>();

  return {
    fetch(request, env, ctx) {
      const pathname = new URL(request.url).pathname;
      if (
        pathname === '/api' ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/invite/')
      ) {
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
