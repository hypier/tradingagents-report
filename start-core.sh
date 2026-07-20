#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_ROOT="$ROOT/tg-core"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"

if [[ ! -x "$CORE_ROOT/start.sh" ]]; then
  echo "missing executable: $CORE_ROOT/start.sh" >&2
  exit 1
fi

if [[ -f "$CORE_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$CORE_ROOT/.env"
  set +a
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Starting PostgreSQL via Docker Compose ..."
  # Compose interpolates all services' ${VAR:?} even for postgres-only up.
  export VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_placeholder}"
  export CLERK_SECRET_KEY="${CLERK_SECRET_KEY:-sk_test_placeholder}"
  export CLERK_AUTHORIZED_PARTIES="${CLERK_AUTHORIZED_PARTIES:-http://localhost:5173,http://127.0.0.1:5173}"
  export TRADINGAGENTS_API_KEY="${TRADINGAGENTS_API_KEY:-dev-api-key}"
  export TRADINGAGENTS_POSTGRES_PASSWORD="${TRADINGAGENTS_POSTGRES_PASSWORD:-dev-postgres-password}"
  docker compose --env-file "$CORE_ROOT/.env" -f "$COMPOSE_FILE" up -d postgres
else
  echo "Docker is not running; assuming PostgreSQL is already available on localhost:5432."
fi

echo "Starting tg-core on http://127.0.0.1:8000 ..."
cd "$CORE_ROOT"
exec ./start.sh
