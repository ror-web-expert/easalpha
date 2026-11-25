#!/usr/bin/env bash
# Writes the .env for a new production server: deploy/.env.example with fresh random secrets, this machine's Rails
# master key (easalpha-api/config/master.key, the key the API image's credentials need) and the compose overlays for
# how the internet reaches the server. Written 26 Nov 2026, when the shared server went down and its .env with it.
#
#   SUPER_ADMIN_EMAIL=you@example.com scripts/server-env.sh [out-file]      (default ~/easalpha-server.env)
#   PROXY=tunnel (default): Cloudflare Tunnel, for a server nothing on the internet reaches (production since
#     26 Nov 2026); CLOUDFLARE_TUNNEL_TOKEN=<token> fills the token in, or add it to the file later.
#   PROXY=caddy: Caddy on ports 80/443 with Let's Encrypt, for a server with its own public address.
#   scp ~/easalpha-server.env <user>@<server>:easalpha/.env
#
# Keep the file (a password manager is the right place): it is the only copy of these secrets off the server.
# Restoring the old server's data with its old .env instead? Use that file and only change COMPOSE_FILE.
# Afterwards, by hand in the file: SMTP_* (mail), PADDLE_WEBHOOK_SECRET, SENTRY_DSN, ANALYTICS_ID (docs/DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-$HOME/easalpha-server.env}"
PROXY="${PROXY:-tunnel}"
case "$PROXY" in tunnel|caddy) ;; *) echo "PROXY is tunnel or caddy, not $PROXY"; exit 1 ;; esac
KEY_FILE=easalpha-api/config/master.key
: "${SUPER_ADMIN_EMAIL:?set SUPER_ADMIN_EMAIL, the first super admin login for /super}"
[ -e "$OUT" ] && { echo "$OUT already exists; not overwriting it (move it away or name another file)"; exit 1; }
[ -s "$KEY_FILE" ] || { echo "$KEY_FILE is missing: the API cannot read its credentials without it"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is needed for the random secrets"; exit 1; }

# ghcr.io/<owner>/easalpha, from the origin remote (the deploy job rewrites IMAGE_REPO and IMAGE_TAG on every deploy).
OWNER="${IMAGE_OWNER:-$(git remote get-url origin | sed -E 's#^.*[:/]([^/]+)/[^/]+$#\1#' | tr '[:upper:]' '[:lower:]')}"
rand() { openssl rand -hex "$1"; }

umask 077
cp deploy/.env.example "$OUT"
chmod 600 "$OUT"
# Replaces the whole NAME= line (value and comment) or appends it; awk reads the value from the environment, so no
# character in it is special.
set_var() {
  NAME="$1" VALUE="$2" awk 'BEGIN { n = ENVIRON["NAME"]; v = ENVIRON["VALUE"] }
    index($0, n "=") == 1 { print n "=" v; found = 1; next } { print } END { if (!found) print n "=" v }' "$OUT" > "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"
}

SUPER_ADMIN_PASSWORD="$(rand 12)"
set_var POSTGRES_PASSWORD "$(rand 24)"
set_var RAILS_MASTER_KEY "$(tr -d '[:space:]' < "$KEY_FILE")"
set_var WHATSAPP_GATEWAY_TOKEN "$(rand 24)"
set_var SUPER_ADMIN_EMAIL "$SUPER_ADMIN_EMAIL"
set_var SUPER_ADMIN_PASSWORD "$SUPER_ADMIN_PASSWORD"
set_var UMAMI_APP_SECRET "$(rand 32)"
set_var COMPOSE_FILE "docker-compose.yml:docker-compose.images.yml:docker-compose.$PROXY.yml"
[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] && set_var CLOUDFLARE_TUNNEL_TOKEN "$CLOUDFLARE_TUNNEL_TOKEN"
set_var IMAGE_REPO "ghcr.io/$OWNER/easalpha"
set_var IMAGE_TAG latest

if grep -q '=change-me' "$OUT"; then echo "Left a change-me value in $OUT:"; grep -n '=change-me' "$OUT"; exit 1; fi
echo "Wrote $OUT (mode 600)."
echo "Super admin for https://easalpha.com/super: $SUPER_ADMIN_EMAIL / $SUPER_ADMIN_PASSWORD"
echo "(only used to create the account on a fresh database; change it after the first login)"
if [ "$PROXY" = tunnel ] && ! grep -q "^CLOUDFLARE_TUNNEL_TOKEN=." "$OUT"; then
  echo "CLOUDFLARE_TUNNEL_TOKEN is still empty: every docker compose command refuses to run until it is set."
fi
echo "Next: fill SMTP_* and the other optional values, then  scp $OUT <user>@<server>:easalpha/.env"
