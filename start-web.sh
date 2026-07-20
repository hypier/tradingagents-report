#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$ROOT/tg-web"

if [[ ! -f "$WEB_ROOT/package.json" ]]; then
  echo "missing: $WEB_ROOT/package.json" >&2
  exit 1
fi

echo "Starting tg-web (Vite + BFF) ..."
echo "  Web app:   http://localhost:5173"
echo "  Web BFF:   http://localhost:8788"
echo

cd "$WEB_ROOT"
exec pnpm dev
