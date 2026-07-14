# Task 3 Report: Core table mappings and database boundaries

## Status

Implemented the scoped Node PostgreSQL database boundary in `tg-web` without
modifying Core, routes, user tables, credentials, or package dependencies.

## Delivered

- `tg-web/src/backend/database/schema.ts`
  - Exact Drizzle mappings for Core-owned `analysis_jobs`, `llm_model_prices`,
    and `llm_pricing_sources`, including Core defaults, keys, and
    `analysis_jobs` indexes.
- `tg-web/src/backend/database/client.ts`
  - `createNodeDatabase(databaseUrl)` and
    `createWorkerDatabase(connectionString)`, both backed only by `pg` and
    `drizzle-orm/node-postgres`.
  - Public `DatabaseHealth` with `healthcheck()` and the three repositories.
- `tg-web/src/backend/database/repositories.ts`
  - Query-only `analysisJobs` access (`getById`, filtered/paginated `list`).
  - Model-price `list`, composite-key `upsert`, and composite-key `delete`.
  - List-only pricing sources.
  - No `analysis_jobs` mutation API is exported.
- `tg-web/drizzle.config.ts`
  - Points Drizzle Kit at the schema for type checking and future Web-owned
    migrations; no Core migration was generated or run.
- `tg-web/tests/unit/schema.test.ts`
  - Verifies all three mapped Core table names.
- `tg-web/tests/integration/database.test.ts`
  - Uses a disposable `postgres:16-alpine` Testcontainers fixture whose table
    DDL and indexes are copied from `tg-core/infrastructure/database.py`.
  - Covers health checks, Core-table reads, absence of analysis-job mutation,
    and model-price upsert/delete.

## TDD Evidence

1. `pnpm test:unit -- schema.test.ts` initially failed because
   `src/backend/database/schema.ts` did not exist.
2. After the declarative schema mapping, the same command passed.
3. `pnpm test:integration -- database.test.ts` initially failed because
   `src/backend/database/client.ts` did not exist.
4. The client and repositories were then implemented. The integration fixture
   is currently blocked before execution by the unavailable container runtime.

## Verification

Passed:

- `cd tg-web && pnpm test:unit` (4 files, 16 tests)
- `cd tg-web && pnpm test:worker` (no worker tests configured; exits 0)
- `cd tg-web && pnpm typecheck`
- `cd tg-web && pnpm lint`
- `cd tg-web && pnpm format:check`
- `git diff --check`

Blocked by environment:

- `cd tg-web && pnpm test:integration -- database.test.ts`
- Testcontainers fails at `GenericContainer('postgres:16-alpine').start()` with
  `Error: Could not find a working container runtime strategy` from
  `testcontainers/build/container-runtime/clients/client.js:67`.
- The fixture only derives its URL from the disposable container host and mapped
  port, so it does not point at a developer or production database.

## Concerns

The real PostgreSQL integration assertions should be rerun where Docker or a
compatible container runtime is available. No source-level concerns remain
within the requested scope.
