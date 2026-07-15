# tg-web Full-Stack Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `tg-web/` as one TypeScript React/Hono application that runs as a single Docker web container or a single Cloudflare Worker while reusing the existing Core PostgreSQL schema and Core API.

**Architecture:** Vite builds the React SPA and a runtime-neutral Hono BFF serves the same-origin `/api` boundary. Node and Cloudflare entry points inject platform adapters for PostgreSQL and cache, then expose the same Hono app; only the Node entry serves Vite build output. Drizzle maps the three Core tables without owning their migrations, and Core API calls remain the exclusive path for analysis job mutations.

**Tech Stack:** TypeScript strict mode, React, Vite, React Router, TanStack Query, Hono, Zod, Drizzle ORM with `pg`, Redis, Cloudflare Workers/KV/Hyperdrive, Tailwind CSS, shadcn/ui conventions, Lucide, Vitest, React Testing Library, Playwright, Docker, pnpm.

## Global Constraints

- Create `tg-web/` as a standalone pnpm package adjacent to `tg-core/`; do not convert the repository root into a JavaScript workspace.
- Require Node.js 20 or newer for Docker and local Node development.
- Keep the frontend and BFF in one package and one production deployment unit; do not create a separately deployed API service.
- React calls only same-origin `/api`; never expose PostgreSQL, Redis, KV, Hyperdrive bindings, `CORE_API_KEY`, or Core URLs to the client bundle.
- Cloudflare uses Workers Static Assets, KV, Hyperdrive, and `nodejs_compat`; Docker uses one Node/Hono application container, Redis, and `pg.Pool`.
- Use `pg` with Drizzle's `node-postgres` driver in both runtime adapters.
- Map `analysis_jobs`, `llm_model_prices`, and `llm_pricing_sources` exactly as Core defines them; do not generate or run Drizzle migrations for these Core-owned tables.
- Direct `analysis_jobs` access is query-only. All analysis job state changes go through `tg-core` HTTP API.
- `llm_model_prices` repository supports direct CRUD for future authorized features; `llm_pricing_sources` repository is query-only.
- Cache is non-authoritative. A Redis or KV outage is logged and bypassed for ordinary cache calls; it must not change job or database truth.
- Implement no user, session, role, payment, report, analysis, or administration feature beyond the health/readiness scaffold.
- Do not create branches or commits unless the user explicitly asks. This overrides the plan skill's default commit cadence.

---

## Planned File Structure

```text
tg-web/
├── .env.example
├── .gitignore
├── Dockerfile
├── README.md
├── compose.yaml
├── components.json
├── drizzle.config.ts
├── eslint.config.js
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── prettier.config.mjs
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── wrangler.jsonc
├── src/
│   ├── backend/
│   │   ├── app.ts
│   │   ├── cache/{contract.ts,kv-cache.ts,redis-cache.ts}
│   │   ├── config/{node-config.ts,worker-config.ts}
│   │   ├── core/client.ts
│   │   ├── database/{client.ts,repositories.ts,schema.ts}
│   │   ├── errors/{app-error.ts,error-response.ts}
│   │   ├── logging/{logger.ts,request-id.ts}
│   │   └── routes/{health.ts,ready.ts}
│   ├── frontend/
│   │   ├── app/{app.tsx,query-client.ts,router.tsx}
│   │   ├── lib/api-client.ts
│   │   ├── pages/{home-page.tsx,not-found-page.tsx}
│   │   ├── styles/globals.css
│   │   └── main.tsx
│   ├── runtimes/{cloudflare.ts,node.ts}
│   └── shared/{contracts.ts,types.ts}
└── tests/
    ├── e2e/app.spec.ts
    ├── integration/{database.test.ts,redis-cache.test.ts}
    ├── unit/{app.test.ts,cache.test.ts,config.test.ts,core-client.test.ts,error-response.test.ts,schema.test.ts}
    └── worker/cloudflare.test.ts
```

No files under `tg-core/` change in this plan. The three existing Core tables remain owned by `tg-core/infrastructure/database.py`.

---

### Task 1: Bootstrap the standalone package and quality toolchain

**Files:**
- Create: `tg-web/package.json`
- Create: `tg-web/tsconfig.json`
- Create: `tg-web/tsconfig.node.json`
- Create: `tg-web/vite.config.ts`
- Create: `tg-web/vitest.config.ts`
- Create: `tg-web/eslint.config.js`
- Create: `tg-web/prettier.config.mjs`
- Create: `tg-web/postcss.config.mjs`
- Create: `tg-web/components.json`
- Create: `tg-web/.gitignore`
- Create: `tg-web/.env.example`
- Create: `tg-web/src/shared/contracts.ts`
- Create: `tg-web/tests/unit/contracts.test.ts`

**Interfaces:**
- Produces `ApiSuccess<T>` and `ApiFailure` in `src/shared/contracts.ts` for every later backend route and frontend client.
- Produces scripts: `dev`, `dev:api`, `dev:web`, `build`, `build:node`, `typecheck`, `lint`, `format:check`, `test`, `test:unit`, `test:integration`, `test:worker`, and `test:e2e`.

- [ ] **Step 1: Write the failing shared-contract test**

```ts
// tests/unit/contracts.test.ts
import { describe, expect, it } from 'vitest'
import { apiSuccess, isApiFailure } from '../../src/shared/contracts'

describe('shared API contracts', () => {
  it('builds a typed success envelope and identifies failure envelopes', () => {
    expect(apiSuccess({ status: 'ok' }, 'req-1')).toEqual({
      data: { status: 'ok' },
      requestId: 'req-1',
    })
    expect(isApiFailure({ error: { code: 'NOT_FOUND', message: 'missing', requestId: 'req-1' } })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify the package has no implementation**

Run: `cd tg-web && pnpm test:unit -- contracts.test.ts`

Expected: FAIL because `package.json`, the test runner, and `src/shared/contracts.ts` do not exist.

- [ ] **Step 3: Add the package manifest and TypeScript/tooling configuration**

Use a single `package.json` with Node `>=20`, `type: "module"`, and scripts equivalent to:

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm dev:api\" \"pnpm dev:web\"",
    "dev:api": "tsx watch src/runtimes/node.ts",
    "dev:web": "vite",
    "build": "pnpm build:node && vite build",
    "build:node": "tsup src/runtimes/node.ts --format esm --out-dir dist/backend",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.node.json --noEmit",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "test": "pnpm test:unit && pnpm test:worker",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:worker": "vitest run --project worker",
    "test:e2e": "playwright test"
  }
}
```

Install React, React DOM, React Router, TanStack Query, Hono, Zod, Drizzle ORM, `pg`, `ioredis`, Tailwind CSS, Lucide, and the matching development dependencies for Vite, TypeScript, tsx, tsup, Vitest, Playwright, ESLint, Prettier, `testcontainers`, and Cloudflare Workers tests. Configure Vite aliases `@/frontend`, `@/backend`, and `@/shared`; proxy `/api` to `http://127.0.0.1:8787` in development. Put only variable names and safe sample values in `.env.example`.

- [ ] **Step 4: Implement the shared contracts**

```ts
// src/shared/contracts.ts
export type ApiSuccess<T> = { data: T; requestId: string }

export type ApiFailure = {
  error: { code: string; message: string; requestId: string }
}

export function apiSuccess<T>(data: T, requestId: string): ApiSuccess<T> {
  return { data, requestId }
}

export function isApiFailure(value: unknown): value is ApiFailure {
  return typeof value === 'object' && value !== null && 'error' in value
}
```

Use TypeScript strict mode, configure Vitest projects named `unit`, `integration`, and `worker`, and exclude `dist`, `node_modules`, `.env`, and Playwright artifacts through `.gitignore`.

- [ ] **Step 5: Install dependencies and verify the initial quality gate**

Run: `cd tg-web && pnpm install && pnpm test:unit -- contracts.test.ts && pnpm typecheck && pnpm lint && pnpm format:check`

Expected: all commands exit `0`; the contract test passes.

### Task 2: Add configuration, request IDs, structured logging, and unified errors

**Files:**
- Create: `tg-web/src/backend/config/node-config.ts`
- Create: `tg-web/src/backend/config/worker-config.ts`
- Create: `tg-web/src/backend/errors/app-error.ts`
- Create: `tg-web/src/backend/errors/error-response.ts`
- Create: `tg-web/src/backend/logging/logger.ts`
- Create: `tg-web/src/backend/logging/request-id.ts`
- Create: `tg-web/tests/unit/config.test.ts`
- Create: `tg-web/tests/unit/error-response.test.ts`

**Interfaces:**
- Consumes `ApiFailure` from `src/shared/contracts.ts`.
- Produces `parseNodeConfig(env): NodeConfig`, `parseWorkerConfig(env): WorkerConfig`, `AppError`, `toErrorResponse(error, requestId)`, `createRequestIdMiddleware()`, and `Logger`.
- Later tasks use `NodeConfig`, `WorkerConfig`, `Logger`, and `AppError` without reading ambient environment variables.

- [ ] **Step 1: Write failing configuration and error tests**

```ts
// tests/unit/config.test.ts
import { describe, expect, it } from 'vitest'
import { parseNodeConfig } from '../../src/backend/config/node-config'

describe('parseNodeConfig', () => {
  it('rejects an invalid database URL', () => {
    expect(() => parseNodeConfig({
      CORE_API_URL: 'https://core.example.test',
      CORE_API_KEY: 'secret',
      DATABASE_URL: 'not-a-url',
      REDIS_URL: 'redis://127.0.0.1:6379',
      PORT: '8787',
    })).toThrow(/DATABASE_URL/)
  })
})
```

```ts
// tests/unit/error-response.test.ts
import { describe, expect, it } from 'vitest'
import { AppError } from '../../src/backend/errors/app-error'
import { toErrorResponse } from '../../src/backend/errors/error-response'

it('does not expose an internal cause', () => {
  const response = toErrorResponse(new AppError('CORE_UNAVAILABLE', 503, 'Core unavailable', new Error('token=secret')), 'req-7')
  expect(response).toEqual({ error: { code: 'CORE_UNAVAILABLE', message: 'Core unavailable', requestId: 'req-7' } })
  expect(JSON.stringify(response)).not.toContain('secret')
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd tg-web && pnpm test:unit -- config.test.ts error-response.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement explicit runtime configuration and safe errors**

Define the shared server configuration shape:

```ts
export type ServerConfig = {
  coreApiUrl: URL
  coreApiKey: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}
```

`parseNodeConfig` must require `CORE_API_URL`, `CORE_API_KEY`, `DATABASE_URL`, and `REDIS_URL`, parse `PORT` as an integer from `1` to `65535`, and default `LOG_LEVEL` to `info`. `parseWorkerConfig` must require `CORE_API_URL`, `CORE_API_KEY`, `HYPERDRIVE`, `CACHE_KV`, and `ASSETS` from the Worker environment. Use Zod for both validators.

Implement `AppError` with `code`, `status`, `publicMessage`, and optional `cause`. `toErrorResponse` must return only the public error envelope. The logger must accept structured metadata, redact values whose key matches `authorization`, `cookie`, `core_api_key`, `database_url`, `redis_url`, or `url` containing credentials, and never serialize `cause` into a client response.

Request ID middleware must preserve a valid inbound `x-request-id` of at most 128 characters; otherwise generate `crypto.randomUUID()`, store it in Hono context, and add it to the outgoing response header.

- [ ] **Step 4: Run the focused tests and static checks**

Run: `cd tg-web && pnpm test:unit -- config.test.ts error-response.test.ts && pnpm typecheck && pnpm lint`

Expected: all commands exit `0`.

### Task 3: Map the three Core tables and expose database access boundaries

**Files:**
- Create: `tg-web/src/backend/database/schema.ts`
- Create: `tg-web/src/backend/database/client.ts`
- Create: `tg-web/src/backend/database/repositories.ts`
- Create: `tg-web/drizzle.config.ts`
- Create: `tg-web/tests/unit/schema.test.ts`
- Create: `tg-web/tests/integration/database.test.ts`

**Interfaces:**
- Consumes `ServerConfig` from Task 2.
- Produces `createNodeDatabase(databaseUrl)`, `createWorkerDatabase(connectionString)`, `DatabaseHealth`, `AnalysisJobsRepository`, `ModelPricesRepository`, and `PricingSourcesRepository`.
- Later readiness routes consume `database.healthcheck()`; future features consume repositories instead of directly constructing SQL clients.

- [ ] **Step 1: Write failing schema and repository-boundary tests**

```ts
// tests/unit/schema.test.ts
import { describe, expect, it } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { analysisJobs, llmModelPrices, llmPricingSources } from '../../src/backend/database/schema'

describe('Core table mappings', () => {
  it('maps the three Core-owned table names', () => {
    expect(getTableName(analysisJobs)).toBe('analysis_jobs')
    expect(getTableName(llmModelPrices)).toBe('llm_model_prices')
    expect(getTableName(llmPricingSources)).toBe('llm_pricing_sources')
  })
})
```

```ts
// tests/integration/database.test.ts
it('does not expose an analysis-job mutation method', () => {
  expect('updateStatus' in analysisJobsRepository).toBe(false)
})
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- schema.test.ts`

Expected: FAIL because the Drizzle schema does not exist.

- [ ] **Step 3: Implement an exact Drizzle schema**

Use `pgTable`, `uuid`, `text`, `date`, `jsonb`, `integer`, `numeric`, `timestamp`, `primaryKey`, `index`, and `uniqueIndex` to define:

```ts
export const analysisJobs = pgTable('analysis_jobs', {
  id: uuid('id').primaryKey(),
  requestId: uuid('request_id'),
  ticker: text('ticker').notNull(),
  tradeDate: date('trade_date').notNull(),
  assetType: text('asset_type').notNull(),
  analysts: jsonb('analysts').$type<string[]>().notNull(),
  status: text('status').$type<'queued' | 'running' | 'succeeded' | 'failed'>().notNull(),
  request: jsonb('request').$type<Record<string, unknown>>().notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  finalState: jsonb('final_state').$type<Record<string, unknown> | null>(),
  decision: text('decision'),
  error: text('error'),
  reportPath: text('report_path'),
  tokensUsed: integer('tokens_used').notNull().default(0),
  tokenUsage: jsonb('token_usage').$type<Record<string, unknown>>().notNull().default({}),
  costUsd: numeric('cost_usd', { precision: 18, scale: 8 }).notNull().default('0'),
  costBreakdown: jsonb('cost_breakdown').$type<Record<string, unknown>>().notNull().default({}),
  progressPercent: integer('progress_percent').notNull().default(0),
  currentStep: text('current_step'),
  events: jsonb('events').$type<Record<string, unknown>[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, table => [
  uniqueIndex('analysis_jobs_request_id_key').on(table.requestId).where(sql`${table.requestId} is not null`),
  index('analysis_jobs_ticker_created_idx').on(table.ticker, desc(table.createdAt)),
  index('analysis_jobs_status_created_idx').on(table.status, desc(table.createdAt)),
])
```

Define every `llm_model_prices` and `llm_pricing_sources` field, default, timestamp, and primary key exactly as in `tg-core/infrastructure/database.py`. `llm_model_prices` must use composite primary key `(provider, model, billing_mode, context_tier)` and `llm_pricing_sources` primary key `source_url`.

Create a client factory using `drizzle-orm/node-postgres`. Its public database service must expose `healthcheck(): Promise<void>` and three repository objects:

```ts
export type AnalysisJob = typeof analysisJobs.$inferSelect
export type ModelPrice = typeof llmModelPrices.$inferSelect
export type NewModelPrice = typeof llmModelPrices.$inferInsert
export type PricingSource = typeof llmPricingSources.$inferSelect
export type ModelPriceKey = Pick<ModelPrice, 'provider' | 'model' | 'billingMode' | 'contextTier'>

export type AnalysisJobsRepository = {
  getById(id: string): Promise<AnalysisJob | undefined>
  list(input: { ticker?: string; status?: AnalysisJob['status']; limit: number; offset: number }): Promise<AnalysisJob[]>
}

export type ModelPricesRepository = {
  list(input: { provider?: string }): Promise<ModelPrice[]>
  upsert(input: NewModelPrice): Promise<ModelPrice>
  delete(key: ModelPriceKey): Promise<void>
}

export type PricingSourcesRepository = {
  list(): Promise<PricingSource[]>
}

export type DatabaseHealth = {
  healthcheck(): Promise<void>
  analysisJobs: AnalysisJobsRepository
  modelPrices: ModelPricesRepository
  pricingSources: PricingSourcesRepository
}
```

Do not add `insert`, `claim`, `updateProgress`, `markSucceeded`, `markFailed`, or any other `analysis_jobs` mutation. Configure Drizzle Kit only to locate the schema for type checking and future Web-owned migrations; do not run `drizzle-kit generate` for the three Core tables.

- [ ] **Step 4: Add a temporary PostgreSQL integration fixture**

Create the test fixture SQL by copying the exact `CREATE TABLE` statements and indexes from `tg-core/infrastructure/database.py` into the integration test setup. Start `postgres:16-alpine` with `GenericContainer` from `testcontainers`, set `POSTGRES_DB=tg_web_test`, `POSTGRES_USER=tg_web_test`, and `POSTGRES_PASSWORD=tg_web_test`, expose port `5432`, then construct the test-only database URL from `container.getHost()` and `container.getMappedPort(5432)`. Apply the fixture SQL, insert one row for each table, and assert:

```ts
expect(await database.analysisJobs.list({ limit: 10, offset: 0 })).toHaveLength(1)
expect(await database.modelPrices.list({ provider: 'openai' })).toHaveLength(1)
expect(await database.pricingSources.list()).toHaveLength(1)
```

- [ ] **Step 5: Run database checks**

Run: `cd tg-web && pnpm test:unit -- schema.test.ts && pnpm test:integration -- database.test.ts`

Expected: both commands exit `0`; the integration test uses a disposable database and never points at a developer or production database.

### Task 4: Implement the KV/Redis-compatible cache contract

**Files:**
- Create: `tg-web/src/backend/cache/contract.ts`
- Create: `tg-web/src/backend/cache/redis-cache.ts`
- Create: `tg-web/src/backend/cache/kv-cache.ts`
- Create: `tg-web/tests/unit/cache.test.ts`
- Create: `tg-web/tests/integration/redis-cache.test.ts`

**Interfaces:**
- Produces `Cache`, `RedisCache`, and `KvCache`.
- Later readiness routes consume `cache.healthcheck()`. Future services consume `get`, `set`, and `delete` only.

- [ ] **Step 1: Write failing cache contract tests**

```ts
// tests/unit/cache.test.ts
import { describe, expect, it } from 'vitest'
import { exerciseCacheContract } from '../../src/backend/cache/contract'

it('requires cache adapters to support get, TTL set, and delete', async () => {
  await exerciseCacheContract(async cache => {
    await cache.set('ticker:NVDA', 'value', 60)
    expect(await cache.get('ticker:NVDA')).toBe('value')
    await cache.delete('ticker:NVDA')
    expect(await cache.get('ticker:NVDA')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the cache test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- cache.test.ts`

Expected: FAIL because no cache contract exists.

- [ ] **Step 3: Implement the minimal adapter contract**

```ts
export interface Cache {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  healthcheck(): Promise<void>
}
```

`RedisCache.set` must use Redis `SET key value EX ttlSeconds`; `RedisCache.healthcheck` must issue `PING`. `KvCache.set` must call `KVNamespace.put(key, value, { expirationTtl: ttlSeconds })`; `KvCache.healthcheck` must perform a read of a fixed health key without writing it. Both constructors receive a logger and must log cache errors with a safe key name, then rethrow to their caller. The application layer, not the adapter, decides to bypass ordinary cache failures.

- [ ] **Step 4: Add Redis integration coverage**

Start `redis:7-alpine` with `GenericContainer` from `testcontainers`, expose port `6379`, and build its URL from `container.getHost()` and `container.getMappedPort(6379)`. Run the same `exerciseCacheContract` against `new RedisCache(client, logger)`. Add an adapter failure test using a fake KV namespace whose `get` throws and assert the error is logged without leaking the cached value.

- [ ] **Step 5: Run cache checks**

Run: `cd tg-web && pnpm test:unit -- cache.test.ts && pnpm test:integration -- redis-cache.test.ts`

Expected: both commands exit `0`.

### Task 5: Implement the Core client and runtime-neutral Hono health boundary

**Files:**
- Create: `tg-web/src/backend/core/client.ts`
- Create: `tg-web/src/backend/routes/health.ts`
- Create: `tg-web/src/backend/routes/ready.ts`
- Create: `tg-web/src/backend/app.ts`
- Create: `tg-web/tests/unit/core-client.test.ts`
- Create: `tg-web/tests/unit/app.test.ts`

**Interfaces:**
- Consumes `Cache`, database `healthcheck`, `Logger`, `AppError`, `apiSuccess`, and server config from earlier tasks.
- Produces `CoreClient`, `createApp(dependencies)`, and exported `AppType`.
- Runtime entries in Tasks 7 and 8 mount the returned app without changing route logic.

- [ ] **Step 1: Write failing Core client and Hono route tests**

```ts
// tests/unit/core-client.test.ts
it('sends the Core bearer token only from the server client', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', database: 'ok', detail: null })))
  const client = new CoreClient(new URL('https://core.example.test'), 'server-secret', fetchMock)
  await client.healthcheck()
  expect(fetchMock).toHaveBeenCalledWith(
    'https://core.example.test/health',
    expect.objectContaining({ headers: expect.not.objectContaining({ Authorization: expect.anything() }) }),
  )
})
```

```ts
// tests/unit/app.test.ts
it('returns JSON for an unknown API path instead of the SPA document', async () => {
  const app = createApp(fakeDependencies())
  const response = await app.request('/api/unknown')
  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
})
```

Also test that `/api/health` returns `200` without invoking dependency health checks; `/api/ready` returns `200` and `status: "degraded"` when only cache health fails; `/api/ready` returns `503` when database or Core health fails.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd tg-web && pnpm test:unit -- core-client.test.ts app.test.ts`

Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement Core client boundaries**

Use one `CoreClient` with these methods:

```ts
export interface CoreClient {
  healthcheck(): Promise<void>
  submitAnalysis(input: unknown): Promise<unknown>
  listAnalyses(input: URLSearchParams): Promise<unknown>
  getAnalysis(id: string): Promise<unknown>
  getAnalysisEvents(id: string): Promise<unknown>
}
```

`healthcheck()` calls `GET /health` without authorization because Core exposes it publicly. The four protected API methods call the documented Core `/api/v1/analyses` endpoints with `Authorization: Bearer <CORE_API_KEY>`. Apply a finite `AbortSignal.timeout`, validate HTTP errors, and map connection errors to `AppError('CORE_UNAVAILABLE', 503, 'Analysis service is temporarily unavailable')`. Do not expose these methods through a browser route in this scaffold.

- [ ] **Step 4: Implement `createApp` and routes**

```ts
export type AppDependencies = {
  database: { healthcheck(): Promise<void> }
  cache: Cache
  core: CoreClient
  logger: Logger
}

export function createApp(dependencies: AppDependencies) {
  const app = new Hono()
  app.use('/api/*', createRequestIdMiddleware())
  app.route('/api', healthRoutes(dependencies))
  app.route('/api', readyRoutes(dependencies))
  app.notFound(c => c.json(toErrorResponse(new AppError('NOT_FOUND', 404, 'Not found'), requestId(c)), 404))
  app.onError((error, c) => c.json(toErrorResponse(normalizeError(error), requestId(c)), statusFor(error)))
  return app
}
```

`/api/ready` must run database, cache, and Core checks independently with `Promise.allSettled`. Return `{ data: { status, dependencies }, requestId }`, where `status` is `ok` if database and Core pass, `degraded` if only cache fails, and an error response with HTTP `503` if database or Core fails. Log dependency failures with request ID and safe dependency names only.

- [ ] **Step 5: Run Hono and Core client tests**

Run: `cd tg-web && pnpm test:unit -- core-client.test.ts app.test.ts && pnpm typecheck`

Expected: all tests pass and type checking exits `0`.

### Task 6: Build the React SPA shell and typed same-origin BFF client

**Files:**
- Create: `tg-web/src/frontend/main.tsx`
- Create: `tg-web/src/frontend/app/app.tsx`
- Create: `tg-web/src/frontend/app/query-client.ts`
- Create: `tg-web/src/frontend/app/router.tsx`
- Create: `tg-web/src/frontend/lib/api-client.ts`
- Create: `tg-web/src/frontend/pages/home-page.tsx`
- Create: `tg-web/src/frontend/pages/not-found-page.tsx`
- Create: `tg-web/src/frontend/styles/globals.css`
- Create: `tg-web/tests/unit/frontend-app.test.tsx`

**Interfaces:**
- Consumes `AppType` as a type-only import from Task 5 and `ApiSuccess` from Task 1.
- Produces a minimal SPA with `/` and `*` routes, QueryClient provider, and `apiClient` with base path `/api`.
- Node and Worker runtime smoke tests later serve the Vite output.

- [ ] **Step 1: Write the failing SPA tests**

```tsx
// tests/unit/frontend-app.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../../src/frontend/app/app'

it('renders the scaffold home page', () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
  expect(screen.getByRole('main')).toHaveTextContent('TradingAgents')
})

it('renders a 404 page for an unknown route', () => {
  render(<MemoryRouter initialEntries={['/missing']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the frontend test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- frontend-app.test.tsx`

Expected: FAIL because React application modules do not exist.

- [ ] **Step 3: Implement the minimal frontend foundation**

Configure TanStack Query once in `query-client.ts`. Create a `createApiClient` that is typed with Hono `AppType`, sets the base URL to `/api`, and contains no Core URL or secret. Use `import type { AppType } from '@/backend/app'` only.

Implement a calm, minimal application shell with semantic `<main>`, accessible heading hierarchy, responsive padding, and a `Page not found` route. Use Tailwind tokens and Lucide only where an icon is necessary; do not add feature cards, fake data, dashboard widgets, login prompts, or explanatory marketing content. Import `globals.css` from `main.tsx`.

- [ ] **Step 4: Run frontend quality checks**

Run: `cd tg-web && pnpm test:unit -- frontend-app.test.tsx && pnpm typecheck && pnpm lint && pnpm build`

Expected: all commands exit `0`; `dist/frontend/index.html` exists after build.

### Task 7: Add the Node entry point, Docker image, and Docker Compose integration

**Files:**
- Create: `tg-web/src/runtimes/node.ts`
- Create: `tg-web/Dockerfile`
- Create: `tg-web/compose.yaml`
- Create: `tg-web/tests/integration/node-runtime.test.ts`
- Create: `tg-web/tests/integration/docker-smoke.test.ts`

**Interfaces:**
- Consumes `parseNodeConfig`, Node database and Redis cache adapters, `CoreClient`, `createApp`, and built Vite assets.
- Produces a single Node process that mounts the BFF before static files and exposes a one-port Docker image.

- [ ] **Step 1: Write failing Node runtime tests**

```ts
// tests/integration/node-runtime.test.ts
it('returns JSON 404 for /api/unknown and the SPA document for a client deep link', async () => {
  const server = await startNodeRuntime(testDependencies)
  await expect(fetch(`${server.url}/api/unknown`).then(r => r.json())).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
  await expect(fetch(`${server.url}/a/client/route`).then(r => r.text())).resolves.toContain('<div id="root">')
  await server.stop()
})
```

- [ ] **Step 2: Run the Node runtime test to verify it fails**

Run: `cd tg-web && pnpm test:integration -- node-runtime.test.ts`

Expected: FAIL because no Node runtime exists.

- [ ] **Step 3: Implement the Node outer server**

`src/runtimes/node.ts` must parse config once, create `pg.Pool`, `RedisCache`, `CoreClient`, and `createApp` dependencies, then create an outer Hono server with this order:

1. Forward every `/api` and `/api/*` request to the inner BFF app.
2. Serve `/assets/*` from `dist/frontend`.
3. Return `dist/frontend/index.html` for every remaining non-API GET route.

Export this testable helper and only invoke it from the executable module path:

```ts
export async function startNodeRuntime(
  dependencies: AppDependencies,
  options: { port?: number; assetsDirectory: string },
): Promise<{ url: string; stop(): Promise<void> }>
```

Tests pass fake `AppDependencies` to this helper and a temporary directory containing `index.html`; the executable Node module separately constructs real config, database, cache, and Core dependencies. Ensure graceful shutdown closes the PostgreSQL pool and Redis client before stopping the HTTP server. Do not start background Core workers or queues.

Construct `ioredis` with `lazyConnect: true`; do not call `connect`, `ping`, Core health, or PostgreSQL health during process startup. The readiness route is the first code path that checks real dependencies.

- [ ] **Step 4: Implement container and compose files**

Use a multi-stage Node 20 Alpine Dockerfile. Build the Node and Vite artifacts in the builder stage, install production dependencies in the runtime stage, copy only required output, create an unprivileged `appuser`, expose one port, and run `node dist/backend/node.js`.

`compose.yaml` must define exactly two services: `tg-web` and `redis`. `tg-web` receives `DATABASE_URL`, `CORE_API_URL`, `CORE_API_KEY`, `REDIS_URL=redis://redis:6379`, and `PORT`; it must not define PostgreSQL or Core services. Include a Docker healthcheck for `/api/health`. Document that `DATABASE_URL` and `CORE_API_URL` must be routable from the container through the existing Core network or platform network.

- [ ] **Step 5: Run Node and Docker smoke checks**

Run: `cd tg-web && pnpm build && pnpm test:integration -- node-runtime.test.ts && docker build -t tg-web:test .`

Expected: Node routing test passes and Docker build exits `0`.

Start the image with test-safe dependency URLs and verify: `curl -fsS http://127.0.0.1:<mapped-port>/api/health` returns JSON with `data.status` equal to `ok`; `curl -fsS http://127.0.0.1:<mapped-port>/` returns the SPA document.

### Task 8: Add the Cloudflare Worker entry point and KV/Hyperdrive wiring

**Files:**
- Create: `tg-web/src/runtimes/cloudflare.ts`
- Create: `tg-web/wrangler.jsonc`
- Create: `tg-web/tests/worker/cloudflare.test.ts`
- Modify: `tg-web/vitest.config.ts`

**Interfaces:**
- Consumes `parseWorkerConfig`, worker database client, `KvCache`, `CoreClient`, and `createApp`.
- Produces the default Cloudflare Worker `fetch` handler and typed Worker environment.

- [ ] **Step 1: Write failing Worker dispatch tests**

```ts
// tests/worker/cloudflare.test.ts
it('routes API requests to Hono before static assets', async () => {
  const response = await worker.fetch('https://example.test/api/unknown')
  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
})

it('falls back to index.html for a non-API SPA deep link', async () => {
  const response = await worker.fetch('https://example.test/analysis/history')
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('<div id="root">')
})
```

- [ ] **Step 2: Run the Worker test to verify it fails**

Run: `cd tg-web && pnpm test:worker -- cloudflare.test.ts`

Expected: FAIL because the Worker module and bindings are absent.

- [ ] **Step 3: Implement Worker dependency injection and dispatch**

Define:

```ts
export interface WorkerEnv {
  ASSETS: Fetcher
  CACHE_KV: KVNamespace
  HYPERDRIVE: Hyperdrive
  CORE_API_URL: string
  CORE_API_KEY: string
  LOG_LEVEL?: string
}
```

Create the same Hono dependencies as Node, using `env.HYPERDRIVE.connectionString` with the `pg`/Drizzle client and `new KvCache(env.CACHE_KV, logger)`. For every path beginning `/api` or `/api/`, return `createApp(dependencies).fetch(request, env, ctx)`. For every other path, call `env.ASSETS.fetch(request)`; if that response is 404, fetch `/index.html` from `ASSETS` and return it. Do not use an HTML SPA fallback for API routes.

Configure `wrangler.jsonc` with the Worker entry, `assets.directory` pointing to `./dist/frontend`, `nodejs_compat`, binding names `ASSETS`, `CACHE_KV`, and `HYPERDRIVE`, plus named dev/production configuration comments that require deployment-time binding IDs. Keep all credentials out of the file.

- [ ] **Step 4: Verify Worker behavior and local build**

Run: `cd tg-web && pnpm test:worker -- cloudflare.test.ts && pnpm exec wrangler dev --local --test-scheduled`

Expected: worker tests pass; Wrangler starts locally with local bindings. Stop the local command after confirming `/api/health` returns JSON and `/analysis/history` returns the SPA document.

### Task 9: Add end-to-end coverage and operational documentation

**Files:**
- Create: `tg-web/playwright.config.ts`
- Create: `tg-web/tests/e2e/app.spec.ts`
- Create: `tg-web/README.md`
- Modify: `tg-web/.env.example`

**Interfaces:**
- Consumes the Node runtime from Task 7 and Worker output from Task 8.
- Produces repeatable developer, Docker, and Cloudflare deployment instructions without real credentials.

- [ ] **Step 1: Write the failing Playwright smoke tests**

```ts
// tests/e2e/app.spec.ts
import { expect, test } from '@playwright/test'

test('renders the SPA shell and handles a deep link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('main')).toContainText('TradingAgents')
  await page.goto('/analysis/history')
  await expect(page.getByRole('main')).toBeVisible()
})

test('keeps API failures as JSON', async ({ request }) => {
  const response = await request.get('/api/unknown')
  expect(response.status()).toBe(404)
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
})
```

- [ ] **Step 2: Run the end-to-end test to verify the configured web server starts**

Run: `cd tg-web && pnpm test:e2e`

Expected: FAIL until Playwright configuration starts the built Node runtime with the required test configuration and Vite build output.

- [ ] **Step 3: Configure Playwright and write the README**

Configure Playwright `webServer` to run the built Node runtime with complete but unreachable test-only configuration:

```bash
DATABASE_URL=postgresql://unused:unused@127.0.0.1:65432/unused \
REDIS_URL=redis://127.0.0.1:65433 \
CORE_API_URL=http://127.0.0.1:65434 \
CORE_API_KEY=test-only-key \
PORT=8790 \
node dist/backend/node.js
```

The Node runtime must create its PostgreSQL pool, Redis client, and Core client lazily, so startup and the tested `/api/health` and unknown API routes make no network call. Playwright does not call `/api/ready`. Test Chromium at desktop `1440x900` and mobile `390x844` viewports. Do not call real LLM, market-data, Cloudflare, or production services.

Document all supported commands and configuration boundaries:

```bash
cd tg-web
pnpm install
cp .env.example .env
pnpm dev
pnpm build
pnpm test
docker compose up --build
pnpm exec wrangler dev --local
```

The README must explain that Docker launches one `tg-web` container plus Redis, while PostgreSQL and Core are external and must be reachable from the container. It must state that the three mapped tables are Core-owned and `tg-web` does not migrate them. It must describe the cache difference between KV and Redis and the direct-query versus Core-API ownership boundary.

- [ ] **Step 4: Run the complete verification suite**

Run: `cd tg-web && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm test:e2e && docker build -t tg-web:verify .`

Expected: every command exits `0`. Record any command that cannot run because Docker, Cloudflare credentials, or an external test dependency is unavailable; do not claim it passed.

---

## Plan Self-Review

### Spec coverage

| Specification requirement | Implemented by |
|---|---|
| Single React/Hono package and same-origin BFF | Tasks 1, 5, 6 |
| Docker one web container/port plus Redis | Task 7 |
| Cloudflare Worker, Static Assets, KV, Hyperdrive | Task 8 |
| Drizzle mapping for all three Core tables | Task 3 |
| Core API owns job mutations | Tasks 3 and 5 |
| Cache compatibility and non-authoritative behavior | Task 4 and Task 5 |
| Config validation, request IDs, errors, redaction | Task 2 |
| Health/readiness semantics and JSON API 404 | Task 5 |
| Frontend shell without business features | Task 6 |
| Unit, integration, Worker, Docker, and Playwright coverage | Tasks 1 through 9 |
| README and deployment boundaries | Task 9 |

### Consistency checks

- `Cache`, `CoreClient`, repositories, `createApp`, `AppType`, and runtime adapter names are introduced before later tasks consume them.
- The plan never creates an `analysis_jobs` write operation, Core table migration, user table, or business endpoint.
- `pg` is the only Drizzle driver for both runtime adapters.
- Docker Compose contains only the Web application and Redis; Core and PostgreSQL remain external dependencies.
- No task requires a Git commit because repository instructions prohibit automatic commits.
