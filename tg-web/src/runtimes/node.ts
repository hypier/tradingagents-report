import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import Redis from 'ioredis';

import { createApp, type AppDependencies } from '../backend/app';
import { createClerkAuthService } from '../backend/auth/clerk-auth';
import { createBillingConfigurationStore } from '../backend/billing/configuration-store';
import { createManagedStripeBillingService } from '../backend/billing/managed-stripe-billing';
import { FailOpenCache } from '../backend/cache/fail-open-cache';
import { RedisCache } from '../backend/cache/redis-cache';
import { parseNodeConfig } from '../backend/config/node-config';
import { CoreClient } from '../backend/core/client';
import { createNodeDatabase } from '../backend/database/client';
import { Logger } from '../backend/logging/logger';
import { TradingViewMarketClient } from '../backend/market-assets/tradingview-market-client';

type RuntimeOptions = {
  port?: number;
  assetsDirectory: string;
};

type RunningNodeRuntime = {
  url: string;
  stop(): Promise<void>;
};

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export async function startNodeRuntime(
  dependencies: AppDependencies,
  options: RuntimeOptions,
): Promise<RunningNodeRuntime> {
  const app = createApp(dependencies);
  const assetsDirectory = resolve(options.assetsDirectory);
  const server = createServer(async (request, response) => {
    const url = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    );

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await sendFetchResponse(
        response,
        await app.fetch(toFetchRequest(request, url)),
      );
      return;
    }

    if (url.pathname.startsWith('/assets/')) {
      await sendStaticFile(response, assetsDirectory, url.pathname);
      return;
    }

    if (request.method === 'GET') {
      await sendStaticFile(response, assetsDirectory, '/index.html');
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  await new Promise<void>((resolveListening, rejectListening) => {
    server.once('error', rejectListening);
    server.listen(options.port ?? 8788, '0.0.0.0', () => {
      server.off('error', rejectListening);
      resolveListening();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Node runtime did not expose a TCP address');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolveStopped, rejectStopped) => {
        server.close((error) =>
          error ? rejectStopped(error) : resolveStopped(),
        );
      }),
  };
}

function toFetchRequest(request: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    Object.assign(init, {
      body: Readable.toWeb(request),
      duplex: 'half',
    });
  }

  return new Request(url, init);
}

async function sendFetchResponse(
  response: ServerResponse,
  fetchResponse: Response,
): Promise<void> {
  fetchResponse.headers.forEach((value, name) =>
    response.setHeader(name, value),
  );
  response.statusCode = fetchResponse.status;
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}

async function sendStaticFile(
  response: ServerResponse,
  assetsDirectory: string,
  pathname: string,
): Promise<void> {
  const filePath = resolve(assetsDirectory, `.${pathname}`);
  if (relative(assetsDirectory, filePath).startsWith('..')) {
    response.statusCode = 404;
    response.end();
    return;
  }

  try {
    const content = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader(
      'content-type',
      contentTypes[extname(filePath)] ?? 'application/octet-stream',
    );
    response.end(content);
  } catch {
    response.statusCode = 404;
    response.end();
  }
}

async function run(): Promise<void> {
  const config = parseNodeConfig(process.env);
  const logger = new Logger();
  const database = createNodeDatabase(config.databaseUrl);
  const billingConfigurationStore = createBillingConfigurationStore(
    database.billingConfig,
    config.billingConfigEncryptionKey,
  );
  const redis = new Redis(config.redisUrl.toString(), { lazyConnect: true });
  const core = new CoreClient(config.coreApiUrl, config.coreApiKey);
  const dependencies: AppDependencies = {
    auth: createClerkAuthService(config.clerkAuth),
    billing: createManagedStripeBillingService({
      ...config.billing,
      configurationStore: billingConfigurationStore,
    }),
    database,
    cache: new FailOpenCache(new RedisCache(redis, logger), logger),
    core,
    marketAssets: new TradingViewMarketClient(config.tradingViewRapidApiKey),
    logger,
    clerkPublishableKey: config.clerkAuth.publishableKey,
  };
  const runtime = await startNodeRuntime(dependencies, {
    port: config.port,
    assetsDirectory: resolve(process.cwd(), 'dist/frontend'),
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    await database.close();
    if (redis.status === 'wait') {
      redis.disconnect();
    } else {
      await redis.quit();
    }
    await runtime.stop();
  };
  const shutdown = () => {
    void stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error('Node runtime shutdown failed', { error: String(error) });
        process.exit(1);
      });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
