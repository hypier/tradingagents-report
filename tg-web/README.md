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

- `DATABASE_URL`: PostgreSQL connection string in `tg-web/.env`（需含用户名和密码；`pnpm db:migrate` 只读这个值）。
- `REDIS_URL`: Redis used by the Node runtime cache.
- `CORE_API_URL` and `CORE_API_KEY`: the external Core HTTP API. For local
  development, leave `CORE_API_KEY` empty and `pnpm dev` will use
  `TRADINGAGENTS_API_KEY` from `../tg-core/.env`; set `CORE_API_KEY` only when
  Core uses a different token.
- `PORT`: Node BFF port; Vite proxies `/api` to it.
- `VITE_API_BASE_URL`: browser-visible same-origin API base path.
- `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: the Clerk
  application keys used by the browser and BFF respectively. In production
  the browser loads the publishable key from `GET /api/public-config` at
  runtime (from the BFF environment), so changing `config.env` and
  restarting web is enough; rebuilding the image is not required for key
  rotation. Vite still injects the same variable for local `pnpm dev`.
- `CLERK_AUTHORIZED_PARTIES`: comma-separated browser origins allowed in
  Clerk session tokens. Local Vite development normally uses
  `http://localhost:5173` and `http://127.0.0.1:5173`.
- `STRIPE_SECRET_KEY`: optional server-only Stripe API key. When omitted, the
  application remains available and billing is shown as not configured.
- `STRIPE_WEBHOOK_SECRET`: optional Stripe webhook signing secret for
  `/api/stripe/webhook`.
- `BILLING_CONFIG_ENCRYPTION_KEY`: optional Base64-encoded 32-byte master key.
  When configured, administrators can store encrypted Stripe credentials and
  LLM provider API keys (AES-GCM); APIs only return masked hints. Core must use
  the same key to decrypt LLM keys at analysis runtime.
- `APP_BASE_URL`: public application origin used for Checkout success/cancel,
  Customer Portal return, and webhook URLs.

The sample values are placeholders only. Do not commit a populated `.env`.

The signed-out homepage shows `Sign in` and `Sign up` actions. The browser
exposes Clerk's path-routed authentication flows at `/sign-in` and `/sign-up`.
Enable the desired email, password, verification, and social providers in the
Clerk Dashboard. Successful registration and login return to the requested
internal route (or `/`), while signing out returns to `/sign-in`. When the
publishable key is missing or Clerk cannot initialize, the page shows an
explicit configuration error instead of rendering a blank screen.

The earliest user in Clerk is assigned `publicMetadata.role=admin` when that
account first establishes an application session; other unassigned accounts
receive `role=user`. This one-time initialization does not overwrite an
explicitly assigned `user` or `admin` role. Admins see the `/admin/users`
screen and can search users or change other users' roles.
The BFF enforces these permissions on `GET /api/admin/users` and
`PATCH /api/admin/users/:userId/role`; hiding the frontend navigation is not
treated as an authorization boundary. Administrators cannot demote their own
account.

Authenticated users see subscription plans, their current Stripe subscription,
credit balance, credit activity, and invoices at `/billing`. New subscriptions use Stripe Checkout. Renewal,
cancellation, plan changes, payment methods, and billing history are managed in
Stripe Customer Portal. The Stripe Customer ID is stored in the local product
profile and mirrored to Clerk private metadata. Stripe remains the source of
truth for payment state; PostgreSQL is the source of truth for subscription
snapshots, credit reservations, and the credit ledger.

`/account` embeds Clerk's profile manager for names, avatars, credentials,
social accounts, and sessions. Product preferences and versioned acceptance of
the risk disclaimer, terms, and privacy policy are stored locally. Passwords
and Clerk session credentials are never stored by TG-web.

Administrators use `/admin/billing` to inspect connection and webhook status,
create recurring Stripe Products and Prices, and archive active Prices. When
`BILLING_CONFIG_ENCRYPTION_KEY` is configured, administrators can validate,
replace, or clear encrypted Stripe credentials without a service restart.
The plans tab can idempotently provision the standard USD 20, 50, and 100
monthly plans, which grant 20, 50, and 100 analysis credits per paid billing
cycle. Each accepted analysis reserves one credit; rejected jobs release it.

## Product documentation

- [TG-web product functions](docs/PRODUCT_FUNCTIONS.md)
- [LLM models configuration](docs/LLM_MODELS_CONFIGURATION.md)

## Commands

```bash
cd tg-web
pnpm install
pnpm dev
pnpm build
pnpm test
docker compose --env-file ../tg-core/.env -f ../docker/docker-compose.yml up --build
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
docker compose --env-file tg-core/.env -f docker/docker-compose.yml up --build
```

Compose starts `tg-web`, Redis, the Core API, and PostgreSQL on one internal
network. `tg-web` connects to the Core services by their Compose service names.

## Data and cache boundaries

The mapped `analysis_jobs`, `llm_model_prices`, `llm_providers`, and `llm_models`
tables are owned by `tg-web` Drizzle migrations. Configure the shared database
in `tg-web/.env` as `DATABASE_URL`, then run `pnpm db:migrate` manually.
Migrations do not run on Compose, `./start.sh`, or Web process startup. Core
connects with `TRADINGAGENTS_DATABASE_URL` and uses the same tables through SQL;
it does not create or alter them.

Core startup also idempotently creates the shared product tables used by the
BFF: `product_users`, `user_consents`, `billing_subscriptions`,
`credit_accounts`, `credit_reservations`, `credit_ledger_entries`, and
`stripe_webhook_events`. TG-web owns product writes to these tables. The only
Core-side product write is settlement of an optional credit reservation in the
same transaction that marks an analysis job succeeded or failed.

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
Clerk settings described above as deployment configuration. Stripe billing
also requires Stripe credentials and `APP_BASE_URL`. Store
`BILLING_CONFIG_ENCRYPTION_KEY` and any environment-managed Stripe credentials
with Wrangler secret bindings. Configure binding
IDs in the named Wrangler environment and provide secrets through Wrangler or
the deployment platform; do not place production values in `wrangler.jsonc`.
Build the frontend with `VITE_CLERK_PUBLISHABLE_KEY` set. Local Hyperdrive
use also requires
`WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Cloudflare deploys
the Worker, static assets, KV, and Hyperdrive configuration only; Core remains
the owner of its API and job execution, while `tg-web` owns PostgreSQL schema
migrations for the shared tables.
