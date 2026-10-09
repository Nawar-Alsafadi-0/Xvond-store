#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and replace every placeholder." >&2
  exit 1
fi

if grep -Eq 'REPLACE_|development-only|change-me' "$ENV_FILE"; then
  echo "$ENV_FILE still contains placeholder or development values." >&2
  exit 1
fi

# Validate interpolation before changing any running container.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null

# Back up an existing database before rebuilding. First-time deployments have no DB to back up.
if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx postgres; then
  COMPOSE_FILE="$COMPOSE_FILE" sh scripts/backup_database.sh
else
  echo "No running Store PostgreSQL container; skipping pre-deploy backup."
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "Store stack deployed. Run scripts/verify_production.sh after Nginx and HTTPS are configured."
