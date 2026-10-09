#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
STORE_API_ROOT="${STORE_API_ROOT:-https://xvond.com/store-api}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# Verify server-side production configuration, migrations, storage, catalog and launch rules.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
  python scripts/production_preflight.py

# Verify the same public HTTPS path customers and the frontend use.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e STORE_API_ROOT="$STORE_API_ROOT" backend python scripts/smoke_test.py

echo "Production preflight and public smoke checks passed."
