# Deploying EasAlpha

One server, five containers: PostgreSQL, the API, the job worker, the web app and the WhatsApp gateway.

```bash
cp deploy/.env.example deploy/.env      # fill in the values; RAILS_MASTER_KEY is servio-api/config/master.key
cd deploy && docker compose --env-file .env up -d --build
```

Prebuilt images from GitHub Actions instead of building here: set `IMAGE_REPO` and `IMAGE_TAG` in `.env` and list `docker-compose.images.yml` in `COMPOSE_FILE` (see `.env.example`). A TLS proxy that already runs in Docker (Caddy on the production server): add `docker-compose.proxy.yml` too, which drops the published ports and joins the proxy's network; `Caddyfile.easalpha` is the matching Caddy snippet. Step-by-step for Ubuntu, Mac, a LAN and the desktop installers: `docs/SETUP.md`; the production server, pipeline and daily operations: `docs/DEPLOY.md`.

Then put a TLS proxy in front (Caddy example):

```
pos.example.pk { reverse_proxy localhost:3000 }
api.example.pk { reverse_proxy localhost:3001 }
```

On a shop LAN without a domain, set `FORCE_SSL=false`, `PUBLIC_URL=http://<server-ip>:3000` and `API_PUBLIC_URL=http://<server-ip>:3001`; tills, tablets, the kitchen display and rider phones open those addresses. Browsers allow push notifications and installable apps only on HTTPS or localhost, so use the TLS proxy when phones are involved.

First start runs the migrations and creates the super admin from `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` (sign in at `/super`). The demo business is seeded in development only; on a server create your business from `/signup`. Every container restarts on its own after a reboot (`restart: unless-stopped`).

Backups: the `pgdata` volume (database), `storage` (uploaded images and documents) and `wasessions` (the linked WhatsApp phone). Updates: run the compose command again; migrations run on start.

The desktop POS installers are built from `servio-desktop/` (`pnpm dist:linux`, `pnpm dist:win`, `pnpm dist:mac`) or by the `desktop` GitHub Actions workflow. The app opens `PUBLIC_URL/pos`; set that address once in EasAlpha > Printers on each till.
