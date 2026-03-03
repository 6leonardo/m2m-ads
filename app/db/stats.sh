#!/usr/bin/env bash
# filepath: /home/kali/dev/classified/scripts/stats.sh
# Usage: ./scripts/stats.sh
# Set these vars before running:

DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="m2m_dev"
DB_USER="admin"
DB_PASS="secret"

export PGPASSWORD="$DB_PASS"

docker exec -i postgres psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -F": " <<'SQL'
SELECT 'machines'   , COUNT(*) FROM machines;
SELECT 'ads_active' , COUNT(*) FROM announcements WHERE status = 'active';
SELECT 'ads_frozen' , COUNT(*) FROM announcements WHERE status = 'frozen';
SELECT 'ads_ended'  , COUNT(*) FROM announcements WHERE status = 'ended';
SELECT 'matches'    , COUNT(*) FROM matches;
SELECT 'messages'   , COUNT(*) FROM messages;
SQL
