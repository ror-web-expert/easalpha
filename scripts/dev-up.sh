#!/usr/bin/env bash
# Starts everything for a local run: PostgreSQL (Docker), the API with its job worker, the WhatsApp gateway and the web
# app (production build). Idempotent: anything already running is left alone. Stop with scripts/dev-down.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/tmp/logs"; mkdir -p "$LOG"
export WHATSAPP_GATEWAY_URL="${WHATSAPP_GATEWAY_URL:-http://localhost:3010}"
export WHATSAPP_GATEWAY_TOKEN="${WHATSAPP_GATEWAY_TOKEN:-dev-gateway-token}"

up() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

echo "1/4 PostgreSQL"
docker start servio-pg >/dev/null 2>&1 || docker run -d --name servio-pg -p 5434:5432 -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null
until docker exec servio-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

echo "2/4 API and jobs on 3001"
if ! up 3001; then
  (cd "$ROOT/servio-api" && bundle check >/dev/null 2>&1 || bundle install --quiet)
  (cd "$ROOT/servio-api" && bin/rails db:prepare >/dev/null && bin/rails db:seed >/dev/null 2>&1 || true)
  (cd "$ROOT/servio-api" && nohup bin/dev > "$LOG/api.log" 2>&1 &)
fi

echo "3/4 WhatsApp gateway on 3010"
if ! up 3010; then
  (cd "$ROOT/servio-whatsapp" && [ -d node_modules ] || npm install --no-audit --no-fund --silent)
  (cd "$ROOT/servio-whatsapp" && PORT=3010 nohup npm start > "$LOG/whatsapp.log" 2>&1 &)
fi

echo "4/4 Web on 3000 (production build)"
if ! up 3000; then
  (cd "$ROOT/servio-web" && [ -d node_modules ] || pnpm install --silent)
  (cd "$ROOT/servio-web" && [ -f .next/BUILD_ID ] || pnpm build > "$LOG/web-build.log" 2>&1)
  (cd "$ROOT/servio-web" && nohup pnpm start -p 3000 > "$LOG/web.log" 2>&1 &)
fi

for p in 3001 3010 3000; do until up $p; do sleep 1; done; done
cat <<MSG

EasAlpha is up.
  Admin panel      http://localhost:3000/login      demo@easalpha.com / password123
  POS / tablet     http://localhost:3000/pos        pair from Settings, Signed-in devices; cashier PIN 1111, manager PIN 9999
  Kitchen display  http://localhost:3000/kitchen    kitchen PIN 3333
  Rider app        http://localhost:3000/rider      rider PIN 2222
  Storefront       http://localhost:3000/store/demo-cafe
  API              http://localhost:3001/api/v1     WhatsApp gateway http://localhost:3010
Logs: $LOG. Stop: scripts/dev-down.sh
MSG
