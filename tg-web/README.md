# tg-web

`tg-web` is the React single-page application and same-origin BFF for the
TradingAgents research system. It does not place trades or own the Core
service's analysis lifecycle.

## Local development

```bash
cd tg-web
pnpm install
pnpm dev
```

`pnpm dev` creates `.env` from `.env.example` when it is missing, then starts
Vite and the Node BFF. Configure the following values in `.env` for services
that are reachable from the development machine:

- `DATABASE_URL`: PostgreSQL owned and migrated by Core.
- `REDIS_URL`: Redis used by the Node runtime cache.
- `CORE_API_URL` and `CORE_API_KEY`: the external Core HTTP API. For local
  development, leave `CORE_API_KEY` empty and `pnpm dev` will use
  `TRADINGAGENTS_API_KEY` from `../tg-core/.env`; set `CORE_API_KEY` only when
  Core uses a different token.
- `PORT`: Node BFF port; Vite proxies `/api` to it.
- `VITE_API_BASE_URL`: browser-visible same-origin API base path.
- `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: the Clerk
  application keys used by the browser and BFF respectively.
- `CLERK_AUTHORIZED_PARTIES`: comma-separated browser origins allowed in
  Clerk session tokens. Local Vite development normally uses
  `http://localhost:5173` and `http://127.0.0.1:5173`.

The sample values are placeholders only. Do not commit a populated `.env`.

The signed-out homepage shows `Sign in` and `Sign up` actions. The browser
exposes Clerk's path-routed authentication flows at `/sign-in` and `/sign-up`.
Enable the desired email, password, verification, and social providers in the
Clerk Dashboard. Successful registration and login return to the requested
internal route (or `/`), while signing out returns to `/sign-in`. When the
publishable key is missing or Clerk cannot initialize, the page shows an
explicit configuration error instead of rendering a blank screen.

## Product documentation

- [TG-web product functions](docs/PRODUCT_FUNCTIONS.md)

## Commands

```bash
cd tg-web
pnpm install
pnpm dev
pnpm build
pnpm test
docker compose --env-file ../tg-core/.env --profile web -f ../docker/docker-compose.yml up --build
pnpm exec wrangler dev --local
```

Additional checks are `pnpm lint`, `pnpm format:check`, `pnpm typecheck`,
`pnpm test:integration`, and `pnpm test:e2e`.

When using OrbStack, Testcontainers needs its socket explicitly:

```bash
DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock pnpm test:integration
```

`pnpm test:e2e` builds the frontend and Node runtime, then starts the Node
bundle with test-only unreachable PostgreSQL, Redis, and Core URLs. It checks
the SPA shell, a client deep link, and JSON API 404s in Chromium at desktop
(`1440x900`) and mobile (`390x844`) viewports. The test intentionally does not
call `/api/ready`, because readiness is the endpoint that verifies external
dependencies.

## Docker deployment

```bash
docker compose --env-file tg-core/.env --profile web -f docker/docker-compose.yml up --build
```

Compose starts `tg-web`, Redis, the Core API, and PostgreSQL on one internal
network. `tg-web` connects to the Core services by their Compose service names.

## Data and cache boundaries

The mapped `analysis_jobs`, `llm_model_prices`, and `llm_pricing_sources`
tables are Core-owned. `tg-web` does not run migrations for these tables. Its
direct database access is limited to the mapped query boundary; analysis job
creation and other job mutations belong to the Core API, not to `tg-web`.

Redis is the Node runtime cache. Cloudflare Workers use KV for their cache
instead. These are separate backends with different consistency and eviction
properties; neither is authoritative and cached data must not be treated as a
replacement for Core or PostgreSQL.

## Cloudflare Worker deployment

Build the frontend before running the Worker locally:

```bash
cd tg-web
pnpm build
pnpm exec wrangler dev --local
```

The Worker requires a KV namespace, a Hyperdrive binding for the external Core
PostgreSQL database, `CORE_API_URL` plus `CORE_API_KEY`, and the three
Clerk settings described above as deployment configuration. Configure binding
IDs in the named Wrangler environment and provide secrets through Wrangler or
the deployment platform; do not place production values in `wrangler.jsonc`.
Build the frontend with `VITE_CLERK_PUBLISHABLE_KEY` set. Local Hyperdrive
use also requires
`WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Cloudflare deploys
the Worker, static assets, KV, and Hyperdrive configuration only; Core remains
the owner of its API, schema migrations, and job state.
