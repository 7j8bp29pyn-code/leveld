#!/usr/bin/env bash
# Spins up a throwaway local PostgreSQL, applies migrations + RLS tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
trap '"$PGBIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
RUNAS=""; [ "$(id -u)" = "0" ] && { chown -R postgres "$DIR"; RUNAS="sudo -u postgres"; }
$RUNAS "$PGBIN/initdb" -D "$DIR" -U postgres >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f "$ROOT/supabase/tests/supabase_stub.sql"
# migration 1 + its tests (simulates the existing database), then migration 2 twice (idempotency)
MIGS=("$ROOT"/supabase/migrations/*.sql)
$PSQL -f "${MIGS[0]}"
$PSQL -f "$ROOT/supabase/tests/rls_test.sql"
for f in "${MIGS[@]:1}"; do $PSQL -f "$f"; $PSQL -f "$f"; done
$PSQL -f "$ROOT/supabase/tests/rls_test_2.sql"
