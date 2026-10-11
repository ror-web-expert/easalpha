# Deploying Servio

One server, five containers: PostgreSQL, the API, the job worker, the web app and the WhatsApp gateway.

```bash
cp deploy/.env.example deploy/.env      # fill in the values; RAILS_MASTER_KEY is servio-api/config/master.key
cd deploy && docker compose --env-file .env up -d --build
```

Then put a TLS proxy in front (Caddy example):

```
pos.example.pk { reverse_proxy localhost:3000 }
api.example.pk { reverse_proxy localhost:3001 }
```

On a shop LAN without a domain, set `FORCE_SSL=false`, `PUBLIC_URL=http://<server-ip>:3000` and `API_PUBLIC_URL=http://<server-ip>:3001`; tills, tablets, the kitchen display and rider phones open those addresses. Browsers allow push notifications and installable apps only on HTTPS or localhost, so use the TLS proxy when phones are involved.

First start seeds the demo business (demo@servio.pk / password123). Create your own business from the sign-up screen, then remove the demo from the super admin.

Backups: the `pgdata` volume (database), `storage` (uploaded images and documents) and `wasessions` (the linked WhatsApp phone). Updates: run the compose command again; migrations run on start.

The desktop POS installers are built separately from `servio-desktop/` (`pnpm dist:linux`, `pnpm dist:win`) and point at `API_PUBLIC_URL`.
