#!/usr/bin/env bash
# DB migration runner — called automatically by postgres on first volume init.
# Applies each schema version in order, skipping ones already recorded in db_version.
# To add a new version: drop the SQL in init/schemas/<version>.sql and add a line below.

set -euo pipefail

PGUSER="${POSTGRES_USER:-admin}"
PGDB="${POSTGRES_DB:-m2m_dev}"
SCHEMAS_DIR="/docker-entrypoint-initdb.d/schemas"

# Ensure db_version table exists (bootstrap for very first run)
psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" <<'SQL'
CREATE TABLE IF NOT EXISTS db_version (
    id         SERIAL PRIMARY KEY,
    version    TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT now()
);
SQL

apply_if_missing() {
    local version="$1"
    local file="$SCHEMAS_DIR/$version.sql"

    if [ ! -f "$file" ]; then
        echo "ERROR: schema file not found: $file" >&2
        exit 1
    fi

    local exists
    exists=$(psql -U "$PGUSER" -d "$PGDB" -tAc \
        "SELECT COUNT(*) FROM db_version WHERE version='$version';")

    if [ "$exists" = "0" ]; then
        echo "▶ Applying schema version $version ..."
        psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" < "$file"
        echo "✔ $version applied"
    else
        echo "✔ $version already applied, skipping"
    fi
}

# ── Versions — add new lines here as schema files grow ───────────────────────
apply_if_missing "1.0.0"
# apply_if_missing "1.1.0"
# apply_if_missing "2.0.0"
