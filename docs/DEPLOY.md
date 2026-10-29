# Production deployment: easalpha.com

How EasAlpha runs on the production server, how code gets there, and what to do by hand. Updated 11 Oct 2026. General
install options (developer machine, LAN, installers) are in [SETUP.md](SETUP.md).

## The picture

```
GitHub (push to master)                         Server 103.173.62.218 (Ubuntu, Docker, 2 CPU / 4 GB)
  ci.yml       tests                              /opt/caddy/Caddyfile  ->  caddy (ports 80/443, TLS from Let's Encrypt)
  images.yml   build 3 images -> ghcr.io            storeslift.com      ->  kamal-proxy -> genifymart (already there, untouched)
               deploy: ssh -> pull -> up -d         easalpha.com        ->  easalpha-web:3000   (Next.js)
  desktop.yml  installers -> ~/easalpha/downloads     api.easalpha.com    ->  easalpha-api:3001   (Rails API, WebSockets on /cable)
                                                  ~/easalpha/   .env, compose files, downloads/
                                                  containers: easalpha-api, easalpha-web, easalpha-db-1, easalpha-jobs-1, easalpha-whatsapp-1
```

One compose project in `~/easalpha` (copied from `deploy/`), one `.env` that only exists on the server, and the existing
Caddy as the only thing listening on the internet. The EasAlpha containers publish no ports: web and api join Caddy's
`kamal` docker network and Caddy reaches them by name. The other application on the server is not touched.

## One-time setup (what is done, what is left)

| Step | Where | State |
|---|---|---|
| Server folder `~/easalpha` with the compose files and a filled `.env` (generated secrets, master key, super admin login) | server | done |
| Deploy SSH key pair `~/.ssh/easalpha_deploy` (public half must be in the server's `authorized_keys`) | laptop, server | key made; `scripts/github-setup.sh` installs it |
| First images loaded on the server and the stack started (`IMAGE_REPO=easalpha`, `IMAGE_TAG=local`) | server | done by hand once; the pipeline replaces them |
| Caddy: append `deploy/Caddyfile.easalpha` to `/opt/caddy/Caddyfile` and reload (needs sudo) | server | **you**, two commands below |
| DNS: `easalpha.com`, `www`, `api` A records to `103.173.62.218` | registrar | **you** |
| GitHub repository, secrets, variables, first push | laptop | **you**: `gh auth login` then `scripts/github-setup.sh` |

### Caddy (once, with sudo)

```bash
ssh sajid@103.173.62.218
sudo sh -c 'cat ~sajid/easalpha/Caddyfile.easalpha >> /opt/caddy/Caddyfile'
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

The block goes after the `storeslift.com` site; Caddy picks the most specific host, so the `:443` catch-all for the
other app keeps working. Certificates are issued automatically the first time the names resolve to the server.

### DNS (once, at the registrar for easalpha.com)

| Type | Name | Value |
|---|---|---|
| A | `@` (easalpha.com) | 103.173.62.218 |
| A | `www` | 103.173.62.218 |
| A | `api` | 103.173.62.218 |

If the domain is on Cloudflare, keep the three records "DNS only" (grey cloud) at least until the first certificate is
issued; the proxy (orange cloud) also works afterwards, with SSL mode "Full (strict)". Check with `dig +short api.easalpha.com`.

### GitHub (once, on your laptop)

```bash
gh auth login                 # browser login, pick HTTPS, authorise
scripts/github-setup.sh       # creates the private repo "easalpha", sets secrets + variables, installs the deploy key, pushes
```

Override the defaults with environment variables when they differ: `REPO=myorg/easalpha`, `DEPLOY_HOST`, `DEPLOY_USER`,
`PUBLIC_URL`, `API_PUBLIC_URL`. What the script sets:

| Kind | Name | Value | Used by |
|---|---|---|---|
| secret | `DEPLOY_HOST` | 103.173.62.218 | images.yml deploy job, desktop.yml publish job |
| secret | `DEPLOY_USER` | sajid | same |
| secret | `DEPLOY_SSH_KEY` | private key `~/.ssh/easalpha_deploy` | same |
| secret | `DEPLOY_PATH` | /home/sajid/easalpha | images.yml deploy job |
| secret | `DEPLOY_DOWNLOADS_PATH` | /home/sajid/easalpha/downloads | desktop.yml publish job |
| variable | `API_PUBLIC_URL` | https://api.easalpha.com | baked into the web image at build time |
| variable | `PUBLIC_URL` | https://easalpha.com | update feed of the desktop installers |
| variable | `ANALYTICS_PROVIDER` | umami (or plausible) | optional on GitHub; the production server sets it in `.env` instead |
| variable | `ANALYTICS_ID` | the Umami website id, or the Plausible domain | optional, with the one above |

### Analytics (self-hosted Umami at easalpha.com/stats)

The public site's analytics is a Umami instance in the same compose stack (`umami` service, built by `images.yml` from
Umami's repository at a pinned tag with `BASE_PATH=/stats`; `umami-db-init` creates its `umami` database in the stack's
PostgreSQL once). The web container proxies `/stats` to it (`rewrites()` in `easalpha-web/next.config.ts`), so the
dashboard is https://easalpha.com/stats, the tracker is `/stats/script.js` and the collector `/stats/api/send`, all
first-party: no DNS record, certificate or Caddy change, and ad blockers do not block it. Cookieless, so no banner.

Server `.env`: `UMAMI_APP_SECRET` (`openssl rand -hex 32`), `ANALYTICS_PROVIDER=umami`, `ANALYTICS_SRC=/stats/script.js`
and `ANALYTICS_ID=<website id>`. The website id comes from Umami: log in at /stats (the admin password is in the server
`.env` as `UMAMI_ADMIN_PASSWORD`), Settings, Websites, Add website (name EasAlpha, domain easalpha.com), then copy the
Website ID into `.env` and run `docker compose up -d web`. The browser asks `/api/analytics` for the config on every page
view, so the change applies at once. Events the site sends (cta_start_free_click with where, pricing_toggle,
faq_open, whatsapp_click, download_click, signup_started, signup_completed) appear under the website's Events tab.

## Every deploy after that

```bash
git push                      # that is all
```

`ci.yml` runs first: API specs, Rubocop and Brakeman, web lint, typecheck and unit tests, desktop tests. Only when it
passes does `images.yml` start (29 Oct 2026; before that a red suite still deployed). It builds the API, web and WhatsApp
images on GitHub's machines (not on the 2-CPU server), pushes them to `ghcr.io/<you>/easalpha-api|web|whatsapp` tagged
`latest` and the short commit SHA, then the `deploy` job:

1. copies `deploy/` to `~/easalpha/` over SSH (never `.env`, never `downloads/`),
2. writes `IMAGE_REPO` and `IMAGE_TAG` (the commit SHA) into the server's `.env`,
3. logs the server into ghcr.io with the run's own token (no personal token to manage), `docker compose pull`,
   `docker compose up -d --remove-orphans`, prunes old images,
4. waits up to five minutes for `GET /api/v1/health` inside the api container.

Migrations, seeds and the Row-Level Security policies run when the api container starts (`bin/start api`: `db:prepare`,
`db:seed`, `db:rls`), before Puma listens; the old web container keeps serving until the new one is up. With
`EASALPHA_APP_DB_PASSWORD` set in `.env`, the API and the job worker then connect as the `easalpha_app` role, which the
policies apply to (the `postgres` superuser ignores them, so until that variable is set tenant isolation rests on the
application's own scoping alone). Set it once: `openssl rand -hex 24`, paste, `docker compose up -d api jobs`. A failed health check fails the run and prints the API log; the previous
images stay on the server, so `IMAGE_TAG=<previous sha>` in `.env` and `docker compose up -d` rolls back.

Watch a run: `gh run watch`, or Actions on GitHub. Tagged release: `git tag v1.0.0 && git push --tags` also builds and
uploads the desktop installers to the Download page (`desktop.yml`).

## Daily operations on the server

```bash
ssh sajid@103.173.62.218 && cd ~/easalpha
docker compose ps                         # five containers Up
docker compose logs -f api                # or jobs, web, whatsapp, db
docker compose exec api bin/rails console # Rails console (production)
docker compose restart api                # after editing .env
curl -s https://api.easalpha.com/api/v1/health
```

- **Super admin**: `https://easalpha.com/super`, login in `~/easalpha/.env` (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`).
  Change the password after first login; the `.env` value only matters until the account exists.
- **First business**: `https://easalpha.com/signup`.
- **WhatsApp**: Admin > Settings > WhatsApp shows the QR; the linked session persists in the `easalpha_wasessions` volume.
- **Desktop installers**: files in `~/easalpha/downloads/` are served at `https://easalpha.com/downloads/`; the desktop
  workflow uploads new builds there on every `v*` tag and restarts the web container, because Next.js lists `public/`
  files only at start (a file copied by hand is 404 until `docker compose restart web`). The installers default to
  `https://easalpha.com`; a self-hosted shop changes the address once in the app's Printers window.
- **Backup**: the `backup` service (29 Oct 2026, `deploy/backup.sh`) writes every night at `BACKUP_AT` (03:30 server time)
  into `BACKUP_DIR` (`~/easalpha/backups`): `easalpha-<date>.dump` (main database, pg_dump custom format),
  `umami-<date>.dump`, `storage-<date>.tar.gz` (uploads) and `wasessions-<date>.tar.gz` (linked WhatsApp phones, keep it
  as private as a password), and deletes files older than `BACKUP_KEEP_DAYS` (14). Run one now:
  `docker compose run --rm backup now`. A backup on the same disk is only half a backup: set `BACKUP_COPY_CMD`
  (for example `rclone copy "$1" remote:easalpha-backups`) or pull the folder nightly from another machine with rsync.
  Restore the database: `docker compose stop api jobs`, then
  `docker compose exec -T db pg_restore -U postgres --clean --if-exists -d easalpha_production < backups/easalpha-<date>.dump`,
  then `docker compose start api jobs`. Restore uploads: `docker run --rm -v easalpha_storage:/data/storage -v $PWD/backups:/b postgres:16 tar -xzf /b/storage-<date>.tar.gz -C /data`.
- **Paddle**: international card subscriptions arrive as webhooks at `POST /api/v1/webhooks/paddle`. The API refuses them
  (503) until `PADDLE_WEBHOOK_SECRET` is in `.env` (Paddle, Notifications, the endpoint's secret), and checks the signature
  and a five-minute freshness window on every event.
- **Errors**: set `SENTRY_DSN` in `.env` (a free sentry.io project) and the API reports exceptions there; blank means off.
- **Email**: the API sends a welcome email at signup and scheduled reports only when `SMTP_ADDRESS` is set in `.env`
  (with `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`). Create an account at a transactional provider (Resend, Postmark,
  Brevo or Amazon SES), verify the easalpha.com domain there (two DNS records they show you), paste the SMTP values and
  `docker compose up -d api jobs`. Check with `docker compose logs -f jobs` after a signup.
- **Resources**: the stack uses about 1 GB RAM next to the other app; `docker stats` shows it. `docker system prune -f`
  reclaims build layers and old images (the deploy job already prunes dangling images).

## Files

| File | Purpose |
|---|---|
| `deploy/docker-compose.yml` | the five services; builds from source when used alone |
| `deploy/docker-compose.images.yml` | overlay: use the ghcr.io images instead of building |
| `deploy/docker-compose.proxy.yml` | overlay: no published ports, web and api join the `kamal` network for Caddy |
| `deploy/backup.sh` | the nightly backup loop the `backup` service runs; `backup.sh now` for one backup |
| `deploy/Caddyfile.easalpha` | the Caddy site blocks for easalpha.com and api.easalpha.com |
| `deploy/.env.example` | template of the server's `~/easalpha/.env` (`COMPOSE_FILE` selects the overlays) |
| `.github/workflows/images.yml` | build + deploy on every push to master |
| `.github/workflows/desktop.yml` | installers on changes to `easalpha-desktop/` and on `v*` tags, uploaded to the Download page |
| `.github/workflows/ci.yml` | tests on every push and pull request |
| `scripts/github-setup.sh` | one-time GitHub repo, secrets, variables, deploy key, first push |
