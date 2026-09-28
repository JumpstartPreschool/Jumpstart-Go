#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (no Docker needed) and runs supabase/tests/*.test.sql.
# The cluster lives in a temp directory and is deleted afterwards; your own Postgres is never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /opt/homebrew/opt/postgresql@18/bin/initdb)")}"
PORT="${PGPORT_TEST:-54329}"
DIR="$(mktemp -d)"
trap '"$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

"$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null

psql_run() { "$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X "$@"; }

psql_run -f supabase/tests/auth-shim.sql
# Byte order, whatever the terminal's locale: tests rely on it (zz_ prefixes, trips.test.sql before trips_tracking*),
# and in en_US a glob sorts "_" before ".".
in_order() { printf '%s\n' "$@" | LC_ALL=C sort; }
for f in $(in_order supabase/migrations/*.sql); do psql_run -f "$f"; done
for f in $(in_order supabase/tests/*.test.sql); do
  echo "▶ $f"
  psql_run -f "$f"
done
echo "✓ Database tests passed"
