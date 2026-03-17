#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== havesmashed DB Reset & Seed ==="

# 1. Kill backend if running
echo "[1/5] Stopping backend..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 2. Drop & recreate DB
echo "[2/5] Resetting database..."
psql postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'havesmashed' AND pid <> pg_backend_pid();" 2>/dev/null || true
psql postgres -c "DROP DATABASE IF EXISTS havesmashed;"
psql postgres -c "CREATE DATABASE havesmashed;"

# 3. Run backend briefly to apply migrations
echo "[3/5] Applying migrations..."
cd "$SCRIPT_DIR"
cargo run &
CARGO_PID=$!
sleep 6

# 4. Inject seed data
echo "[4/5] Injecting seed data..."
psql havesmashed < "$SCRIPT_DIR/seed.sql"

# 5. Kill the temporary backend
echo "[5/5] Stopping temporary backend..."
kill $CARGO_PID 2>/dev/null || true
wait $CARGO_PID 2>/dev/null || true

echo ""
echo "=== Done! ==="
echo "Start backend with: cargo run"
echo "Login as ahmet: abandon ability able about above absent absorb abstract absurd abuse access accident"
