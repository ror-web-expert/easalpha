# Production deployment: easalpha.com

How EasAlpha runs on the production server, how code gets there, and what to do by hand. Updated 26 Nov 2026, for the
move to a new server: the shared server it ran on from 11 Oct 2026 (103.173.62.218, someone else's machine, behind
that machine's Caddy) went down in Nov 2026 and took the database, the uploads and the backups with it. The new one is
`ubuntu-host`, a Hyper-V VM on an office network (192.168.1.218 behind NAT) that nothing on the internet can reach: the
site comes in through a Cloudflare Tunnel and deploys come in over Tailscale (100.87.45.11). General install options
(developer machine, LAN, installers) are in [SETUP.md](SETUP.md).

## The picture

```
GitHub (push to main)                                   ubuntu-host (Ubuntu 24.04, Docker; tailnet 100.87.45.11, LAN 192.168.1.218)
  ci.yml       tests                                      cloudflared  -- dials out -->  Cloudflare (easalpha.com, www, api)
  images.yml   build 4 images -> ghcr.io                    caddy:80  (inside the stack, no port published)
  deploy.yml   join tailnet -> ssh -> pull -> up              easalpha.com, www   ->  web:3000   (Next.js)
  desktop.yml  installers -> ~/easalpha/downloads              api.easalpha.com    ->  api:3001   (Rails API, WebSockets on /cable)
                                                          ~/easalpha/   .env, compose files, caddy-tunnel/, downloads/, backups/
                                                          containers: cloudflared, caddy, api, web, db, jobs, whatsapp, backup, umami
```

One compose project in `~/easalpha` (copied from `deploy/` by every deploy), one `.env` that lives on the server and in
your password manager (the old server's `.env` existed nowhere else). Nothing on the server listens on the internet:
cloudflared keeps an outbound connection to Cloudflare, which holds the certificates and hands requests to Caddy in the
stack (`docker-compose.tunnel.yml`, `caddy-tunnel/Caddyfile`). No router, port-forwarding or firewall change is needed,
and a change of the office's public address changes nothing. GitHub's deploy job reaches the server by joining the
tailnet for the length of the job.

Other kinds of server, kept for later: one with its own public address uses `docker-compose.caddy.yml` (Caddy on 80/443
with Let's Encrypt, `caddy/Caddyfile`; DNS A records to the address, Cloudflare SSL mode Full (strict)); one where
another application's Caddy already holds 80/443 in Docker, as the shared server did, uses `docker-compose.proxy.yml`
and appends `Caddyfile.easalpha` to that Caddy's file. `COMPOSE_FILE` in `.env` picks one.

## Moving to a new server (26 Nov 2026)

In this order: each step needs the one before it. Commands marked "laptop" run in this repository on your machine,
which is on the same tailnet; "server" means `ssh ubuntu-host@100.87.45.11`.

### 0. Save what can be saved from the old server

Everything below existed only on 103.173.62.218: nothing in this repository or on GitHub holds it. Ask whoever runs that
machine whether its disk can still be read (the machine back for an hour, a rescue mode, or a snapshot):

| What | Where on the old server | Without it |
|---|---|---|
| Nightly backups, last 14 days: `easalpha-<date>.dump`, `umami-<date>.dump`, `storage-<date>.tar.gz`, `wasessions-<date>.tar.gz` | `~/easalpha/backups/` | every business, order, upload and linked WhatsApp phone is gone |
| The server `.env` (SMTP app password, Paddle secret, super admin, Umami website id) | `~/easalpha/.env` | make a new one (step 2); the Rails master key is also on the laptop |
| Or the Docker volumes themselves (`easalpha_pgdata`, `easalpha_storage`, `easalpha_wasessions`) | `/var/snap/docker/common/var-lib-docker/volumes/` (Docker came from the snap there) | as above |

If the machine answers again even briefly, take a fresh backup and copy it off at once:

```bash
ssh sajid@103.173.62.218 'cd ~/easalpha && docker compose run --rm backup now'
mkdir -p ~/easalpha-old && scp -r 'sajid@103.173.62.218:easalpha/backups' 'sajid@103.173.62.218:easalpha/.env' ~/easalpha-old/
```

If nothing can be had, the new server starts with an empty database (step 7, "Fresh start").

### 1. Prepare the server (once, with sudo)

```bash
scp deploy/server-setup.sh ubuntu-host@100.87.45.11:easalpha-setup.sh    # laptop
sudo bash ~/easalpha-setup.sh && exit                                      # server; log in again afterwards
```

`deploy/server-setup.sh` installs Docker Engine and Compose v2 from Docker's own repository (not the snap the old server
had, which hid `/tmp` and kept its data under `/var/snap`), lets `ubuntu-host` run docker, caps container log files at
10 MB x 3, installs rclone for the off-server backup copy and makes `~/easalpha`. Running it again changes nothing.

The VM has **1 virtual CPU** (15 GB RAM, 73 GB disk, 4 GB swap). The old server had 2, and the stack runs PostgreSQL,
Puma, the job worker, two Next.js servers (site, Umami) and the WhatsApp gateway: give the VM 2 to 4 virtual processors
in Hyper-V Manager (VM shut down, Settings, Processor) before real shops use it.

### 2. The server's `.env` (laptop)

```bash
SUPER_ADMIN_EMAIL=<your email> scripts/server-env.sh      # writes ~/easalpha-server.env, prints the super admin password
nano ~/easalpha-server.env                                 # SMTP_* (mail), PADDLE_WEBHOOK_SECRET, SENTRY_DSN if used
scp ~/easalpha-server.env ubuntu-host@100.87.45.11:easalpha/.env && ssh ubuntu-host@100.87.45.11 'chmod 600 ~/easalpha/.env'
```

`scripts/server-env.sh` starts from `deploy/.env.example`, generates the database, gateway and Umami secrets, copies the
Rails master key from `easalpha-api/config/master.key` and selects the tunnel overlay. `TUNNEL_TOKEN` stays
empty until step 3; every `docker compose` command refuses to run until it is filled in. Put the file in your password
manager. Restoring the old data with the old `.env`? Use that file instead: change the `COMPOSE_FILE` line to
`docker-compose.yml:docker-compose.images.yml:docker-compose.tunnel.yml` and add `TUNNEL_TOKEN=`. Keep the
same master key whenever old data is restored: staff PIN lookups, till sync signatures and sign-in tokens are derived
from it.

### 3. Cloudflare Tunnel (Cloudflare dashboard)

1. DNS, Records: delete the three A records `easalpha.com`, `www` and `api` (they point at the dead server, and the
   tunnel's own records cannot be added while they exist).
2. Zero Trust, Networks, Tunnels, Create a tunnel, Cloudflared, name `easalpha`. The install page shows a command ending
   in `--token eyJ...`: copy that long value and skip the install (the stack runs cloudflared itself).
3. Add three public hostnames (shown as "Published application routes" in newer dashboards), each with service type
   **HTTP** and URL **caddy:80**: `easalpha.com`, `www.easalpha.com`, `api.easalpha.com`. Cloudflare makes the DNS
   records itself (proxied CNAMEs to the tunnel).
4. On the server: `nano ~/easalpha/.env`, set `TUNNEL_TOKEN=<the value>`.

The SSL/TLS mode does not matter for a tunnel; "Always Use HTTPS" can stay on. Cloudflare's upload limit (100 MB on the
free plan) is above the 25 MB the Caddyfile allows.

### 4. Tailscale for the deploy (Tailscale admin console)

GitHub's machines are not on the tailnet, so the deploy job joins it for its few minutes, as an ephemeral machine
tagged `tag:ci`, through an OAuth client:

1. Access controls: add the tag's owner, keeping the rest of the policy as it is:
   `"tagOwners": { "tag:ci": ["autogroup:admin"] },`
   The default policy lets every machine reach every other one. If yours is narrower, also allow `tag:ci` to reach
   `ubuntu-host` on port 22. The deploy uses the server's normal OpenSSH over the tailnet address, not Tailscale SSH,
   which does not admit `tag:ci`: keep Tailscale SSH off on ubuntu-host (`tailscale up` without `--ssh`), or it takes
   over port 22 on that address and every deploy is refused.
2. Settings, OAuth clients (or Trust credentials), Generate: scope **Auth Keys, write**, tag **tag:ci**. Copy the
   client id and the secret (it is shown once).
3. Machines, `ubuntu-host`, the menu: **Disable key expiry**. A machine's key expires after 180 days by default; the
   server would then drop off the tailnet and every deploy would fail to reach it (the site itself, through the
   tunnel, keeps working).

### 5. GitHub and the first deploy (laptop)

Commit and push this repository's deploy changes first, then:

```bash
DEPLOY_HOST=100.87.45.11 DEPLOY_USER=ubuntu-host \
TS_OAUTH_CLIENT_ID=<client id> TS_OAUTH_SECRET=<secret> scripts/github-setup.sh
gh workflow run deploy --ref main                  # only if the push said "Everything up-to-date"
```

The script installs `~/.ssh/easalpha_deploy.pub` on the server, sets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`
(`/home/ubuntu-host/easalpha`), `DEPLOY_DOWNLOADS_PATH` and the two Tailscale secrets, and pushes. The run (Actions on
GitHub, about 15 minutes) builds the images, joins the tailnet, copies `deploy/` to `~/easalpha`, pulls, starts the
stack and waits for the API health check. Migrations and seeds run on the first API start, which also creates the
super admin from `.env`.

### 6. Check (server)

```bash
cd ~/easalpha
docker compose config --quiet && docker compose ps      # cloudflared, caddy, db, api, jobs, web, whatsapp, backup, umami Up
docker compose logs cloudflared | grep -i 'registered tunnel connection'   # four lines once the tunnel is up
curl -s https://api.easalpha.com/api/v1/health            # from anywhere
```

In Cloudflare the tunnel shows **Healthy**. If the site answers 502, cloudflared is up but cannot reach `caddy:80`:
`docker compose logs caddy web api`.

### 7. The data

**Restore** (the old backups were saved in step 0): copy them up, then restore as in "Backup" under "Daily operations":

```bash
scp ~/easalpha-old/backups/{easalpha,umami,storage,wasessions}-<date>.* ubuntu-host@100.87.45.11:easalpha/backups/
cd ~/easalpha && docker compose stop api jobs umami
docker compose exec -T db pg_restore -U postgres --clean --if-exists -d easalpha_production < backups/easalpha-<date>.dump
docker compose exec -T db pg_restore -U postgres --clean --if-exists -d umami < backups/umami-<date>.dump
docker run --rm -v easalpha_storage:/data/storage -v $PWD/backups:/b postgres:16 tar -xzf /b/storage-<date>.tar.gz -C /data
docker run --rm -v easalpha_wasessions:/data/wasessions -v $PWD/backups:/b postgres:16 tar -xzf /b/wasessions-<date>.tar.gz -C /data
docker compose up -d                                       # volume-owner gives the restored files back to uid 1000
```

Tills, kitchen screens and phones keep working: the addresses are the same, and their device tokens (365 days, signed
with the master key) match the restored devices. What a till sold offline since the old server went down should sync
once a cashier signs in; anything the server refuses shows in the till's Attention list.

**Fresh start** (nothing saved): the super admin from `.env` is all there is. Then:

- Demo account: `docker compose exec api bin/rails demo:business`, the pictures with
  `python3 scripts/demo-images.py https://api.easalpha.com/api/v1 demo@easalpha.com <password>` from the laptop, and the
  canteen setup again (sessions, workers, plans).
- Every real shop signs up again, and every till, kitchen screen and canteen kiosk is paired again (Admin, Settings,
  Devices). Before that, look at the tills: an order sold offline is still in the till's queue, and the new server
  refuses it because the business is new. Write those down from the till first.
- Umami: log in at https://easalpha.com/stats (first login `admin` / `umami`, change it), add the website, put its id in
  `.env` as `ANALYTICS_ID`, `docker compose up -d web`.

### 8. After the move, both cases

- WhatsApp: Admin, Settings, WhatsApp shows a QR; link the phone again (a restored `wasessions` may still be linked).
- Desktop installers on the Download page: `gh workflow run desktop.yml --ref v0.5.0` (the latest tag) builds them and
  uploads them over the tailnet to `~/easalpha/downloads`.
- Backups off the server: the host cron under "Backup" below. This is the step that would have saved the data this
  time; do it on day one. An office VM can also lose its disk or its power: the copy must leave the building.
- Secrets that lived in the old server's `.env` are on a machine you no longer control: make a new Gmail app password
  (and revoke the old one) and roll the Paddle webhook secret.
- Real client addresses: both Caddyfiles take the customer's address from Cloudflare's `CF-Connecting-IP` (believed only
  from cloudflared, or from Cloudflare's own ranges on a public server). The old snippet did not, so the API's login,
  pairing and request limits counted Cloudflare's addresses: every shop behind the same Cloudflare location shared one
  limit.
- Optional, once the site runs: Row-Level Security (below), Solid Cache (under "Daily operations").

## One-time setup (state on the new server)

| Step | Where | State |
|---|---|---|
| Docker, docker group, log caps, rclone, `~/easalpha` | server | done 26 Nov 2026 (Docker 29.10, Compose v5.8) |
| More than 1 virtual CPU for the VM | Hyper-V host | **you**: still 1 |
| `~/easalpha/.env` | server | done; `TUNNEL_TOKEN` still empty (**you**) |
| Cloudflare Tunnel `easalpha` with three public hostnames to `caddy:80`; old A records deleted | Cloudflare | done 26 Nov 2026; **you**: its token into `.env` as `TUNNEL_TOKEN`, then `docker compose up -d` |
| Tailscale `tag:ci` owner and OAuth client | Tailscale admin | done 26 Nov 2026; **you**: the client id and secret into GitHub |
| Deploy key on the server | server | done (`easalpha-deploy@github-actions` in `~/.ssh/authorized_keys`) |
| GitHub secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_DOWNLOADS_PATH`, `DEPLOY_KNOWN_HOSTS`, `TS_OAUTH_*` | laptop | **you**: `scripts/github-setup.sh` (step 5); until then deploys fail at the SSH step |
| First start | server | done by hand 26 Nov 2026: images 42ce837, fresh database (migrations, seeds, super admin), Row-Level Security on (`"rls":true`), every service but cloudflared up |
| Demo account | server | done 26 Nov 2026: `demo:business` (30 days), pictures, canteen (sessions, 8 workers FP-001..008, plans to 3 Dec, kiosk and counter devices) |
| Umami | server | done 26 Nov 2026: default admin password replaced (`UMAMI_ADMIN_PASSWORD` in `.env`), website EasAlpha, `ANALYTICS_ID` set |
| Download page | server | done 26 Nov 2026: the 0.5.0 installers and update feeds in `~/easalpha/downloads` |
| Backups copied off the server every night | server | **you**: "Backup" under "Daily operations" (backups run on the server; nothing leaves it yet) |
| Mail (`SMTP_*`), WhatsApp (link a phone), Paddle webhook secret, Sentry | server `.env`, Admin | **you**: empty on the new server |
| Row-Level Security: `EASALPHA_APP_DB_PASSWORD` in `.env` | server | done from the first start |

### Caddy

`deploy/caddy-tunnel/Caddyfile` is the whole configuration behind the tunnel: plain HTTP on `caddy:80`, easalpha.com
and www to `web:3000`, api.easalpha.com to `api:3001` with a 25 MB body limit, the customer's own address in
`X-Forwarded-For`. Every deploy copies it to `~/easalpha/caddy-tunnel/` and reloads Caddy, so a change is a push; a
Caddyfile Caddy refuses leaves the running one serving (the deploy log says so). By hand:
`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`. `deploy/caddy/Caddyfile` is the same for a
server with its own address (TLS from Let's Encrypt, Cloudflare's address ranges as the trusted proxies; the copy of
https://www.cloudflare.com/ips from 26 Nov 2026).

### Row-Level Security (once, on the server)

The database itself keeps one business's rows from another only when the API connects as the `easalpha_app` role.
Until `EASALPHA_APP_DB_PASSWORD` is set the API and the job worker connect as `postgres`, a superuser, which the
policies do not bind, so tenant isolation rests on the application's own scoping alone. While that is so, every start
of the api and jobs containers prints a `WARNING: EASALPHA_APP_DB_PASSWORD is not set` block (`docker compose logs api`)
and `GET /api/v1/health` answers `"rls":false`. Nothing else changes and nothing fails. To switch it on:

```bash
ssh ubuntu-host@100.87.45.11 && cd ~/easalpha
openssl rand -hex 24                     # copy the value
nano .env                                # EASALPHA_APP_DB_PASSWORD=<the value> (add the line if .env has none)
docker compose up -d api jobs
curl -s https://api.easalpha.com/api/v1/health   # {"status":"ok",...,"rls":true}
```

At start the api container runs `db:rls` as the owner before Puma: it creates the role (or sets its password from the
variable), applies the policies, and grants the role the tables of the main database and of the others the API
connects to (Solid Cable's `easalpha_production_cable`, and the queue and cache databases), so live updates keep
working. Only then does `bin/start` switch the process to `easalpha_app`; the jobs container switches the same way.
Keep the value in `.env`: the role's password follows it at every start, so changing it and running
`docker compose up -d api jobs` rotates it, and emptying it goes back to `postgres` (the role stays, unused).
`docker compose exec api bin/rails console` keeps connecting as `postgres` (the compose environment), which a support
console needs. If `"rls"` stays `false` after the restart, `docker compose logs api` shows the WARNING (the variable
did not reach the container) or a connection error for `easalpha_app` (the api start that creates the role failed).

### GitHub (once, on your laptop)

```bash
gh auth login                                    # browser login, pick HTTPS, authorise
DEPLOY_HOST=100.87.45.11 DEPLOY_USER=ubuntu-host TS_OAUTH_CLIENT_ID=... TS_OAUTH_SECRET=... scripts/github-setup.sh
```

`DEPLOY_HOST` has no default (since 26 Nov 2026: the old address would point deploys at a dead server). Override the
other defaults with environment variables when they differ: `REPO=myorg/easalpha`, `DEPLOY_USER`,
`PUBLIC_URL`, `API_PUBLIC_URL`. What the script sets:

| Kind | Name | Value | Used by |
|---|---|---|---|
| secret | `DEPLOY_HOST` | the server's address: 100.87.45.11 on the tailnet (103.173.62.218 until Nov 2026) | deploy.yml, desktop.yml publish job |
| secret | `DEPLOY_KNOWN_HOSTS` | the server's host keys, `100.87.45.11 ssh-ed25519 AAAA...` (one line per key), read from its `/etc/ssh`; unset = trust whatever answers (a warning in the log) | same |
| secret | `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | Tailscale OAuth client for `tag:ci` (step 4 above); unset = connect without the tailnet | same |
| secret | `DEPLOY_USER` | ubuntu-host (sajid until Nov 2026) | same |
| secret | `DEPLOY_SSH_KEY` | private key `~/.ssh/easalpha_deploy` | same |
| secret | `DEPLOY_PATH` | /home/ubuntu-host/easalpha | deploy.yml |
| secret | `DEPLOY_DOWNLOADS_PATH` | /home/ubuntu-host/easalpha/downloads | desktop.yml publish job |
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
`latest` and the short commit SHA, then calls `deploy.yml` (its own file since 26 Nov 2026) with that commit:

1. joins the tailnet (when the `TS_OAUTH_*` secrets are set) and copies `deploy/` to `~/easalpha/` over SSH (never
   `.env`, never `downloads/`),
2. writes `IMAGE_REPO` and `IMAGE_TAG` (the commit SHA) into the server's `.env`,
3. logs the server into ghcr.io with the run's own token (no personal token to manage), `docker compose pull`,
   `docker compose up -d --remove-orphans`, prunes old images,
4. waits up to five minutes for `GET /api/v1/health` inside the api container,
5. reloads Caddy (in the stack since 26 Nov 2026), so a changed `deploy/caddy-tunnel/Caddyfile` applies.

The registry token goes to the server over stdin, never on a command line. With `DEPLOY_KNOWN_HOSTS` set, the job
trusts only those host keys (without it, whatever answers, with a warning in the log). Any failed step fails the job.

**Redeploy or roll back by hand**, without a rebuild (the release's images must still be on ghcr.io, which keeps them all):

```bash
gh workflow run deploy --ref main                    # the head of main again
gh workflow run deploy --ref main -f tag=42ce837     # an earlier release: its images and its deploy/ files
```

Or on GitHub: Actions, deploy, Run workflow.

Migrations, seeds and the Row-Level Security policies run when the api container starts (`bin/start api`: `db:prepare`,
`db:seed`, `db:rls`), before Puma listens; the old web container keeps serving until the new one is up. With
`EASALPHA_APP_DB_PASSWORD` set in `.env`, the API and the job worker then connect as the `easalpha_app` role, which the
policies apply to; without it they stay on `postgres`, say so in a WARNING at every start and answer `"rls":false` on
`/api/v1/health` (one-time setup: "Row-Level Security" above). A failed health check fails the run and prints the API log; the previous
images stay on the server, so `IMAGE_TAG=<previous sha>` in `.env` and `docker compose up -d` rolls back.

Since 6 Nov 2026 the API, web and WhatsApp containers run as uid 1000 (`rails` / `node`), not root (security review,
A14; the images were not rebuilt on a laptop, so the first CI build is the test). The two volumes they write,
`easalpha_storage` (uploads, logos, bill PDFs) and `easalpha_wasessions` (the linked WhatsApp phone), were made by root
on this server. The `volume-owner` service in `docker-compose.yml` (alpine, as root, no network) chowns both to
`1000:1000` at every `docker compose up`, and the api, jobs and whatsapp containers start only once it has exited 0, so
no deploy needs a hand step for it (6 Nov 2026 review, R32; not yet run on the server: no Docker where it was written).
`docker compose ps -a` lists it as Exited (0); `docker compose logs volume-owner` shows any error. Fallback by hand, if
it ever fails: `docker run --rm -v easalpha_storage:/d alpine chown -R 1000:1000 /d` and the same for
`easalpha_wasessions`. Without either, uploads and the WhatsApp session fail with "permission denied".

Watch a run: `gh run watch`, or Actions on GitHub. Tagged release: `git tag v1.0.0 && git push --tags` also builds and
uploads the desktop installers to the Download page (`desktop.yml`).

### Once, after the deploy that carries the books fixes (fix rounds of 6 and 7 Nov 2026)

Four rake tasks correct data that older builds left behind. Three put into the journal what those builds recorded
without it, so the Trial Balance and Balance Sheet agree with the customer and supplier ledgers. Each is a dry run
unless `DRY_RUN=0`: it prints, per business, every voucher it would post with its lines and writes nothing. Each is
idempotent: what is already in the journal is left alone, so a second run prints nothing. A voucher is dated to the
day of the record behind it, even a locked day (the record already sits on that day in the customer or supplier
ledger); the output marks those "(locked day)". Take a backup first (`docker compose run --rm backup now`), then
for each task run the dry run, read it, and apply:

```bash
docker compose exec api bin/rails finance:backfill_khata_refunds                 # dry run
docker compose exec -e DRY_RUN=0 api bin/rails finance:backfill_khata_refunds    # write
docker compose exec api bin/rails finance:backfill_supplier_openings             # then DRY_RUN=0
docker compose exec api bin/rails finance:reclass_internal_methods               # then DRY_RUN=0
docker compose exec api bin/rails orders:repair_part_refunds                     # then DRY_RUN=0
```

- `finance:backfill_khata_refunds`: refunds to a customer account made before 6 Nov 2026 lowered the customer's balance
  but posted no voucher, so Accounts Receivable and Sales were overstated by each (review deploy#5). It posts each one as
  the refund journal does now (the sale's split comes back out, the receivable goes down); a refund of a sale journaled
  before the sales split comes out of Sales only.
- `finance:backfill_supplier_openings`: a supplier's opening balance never reached the journal, so Accounts Payable fell
  short of the supplier ledgers (QA B10). It posts each against Owner's Capital on the day the supplier was added.
- `finance:reclass_internal_methods`: the canteen's "Company subsidy" and "Salary deduction" methods had a payment account
  under Cash at Bank (1020.xx) holding money nobody had (QA B4). It moves each day's balance to 5170 Staff Meals or 5110
  Salaries and Wages, closes the two accounts (a closing entry, then archived) and detaches the methods, so the Finance
  dashboard and Balance Sheet stop showing them. An account that also holds other entries, or that a real method uses,
  is left as it is and named in the output.

- `orders:repair_part_refunds`: orders part-refunded before 7 Nov 2026 still read "Partial" with a balance due, because
  the old refund rule lowered what was paid. It puts each back to paid with nothing due; the refund itself is left as
  it is. It writes no voucher, so it runs after the three above in any order.

The audit-log redaction (secrets such as a branch's tax API token kept in older audit rows) needs no step: it is a
migration, and `bin/start api` runs migrations as the database owner, which may lift the append-only trigger for it.
`bin/rails audit:redact` repeats it if ever needed.

`SLUG=demo-cafe` limits any of them to one business.

## Daily operations on the server

```bash
ssh ubuntu-host@100.87.45.11 && cd ~/easalpha
docker compose ps                         # cloudflared, caddy, db, api, jobs, web, whatsapp, backup, umami Up (ps -a: volume-owner and umami-db-init Exited (0))
docker compose logs -f api                # or jobs, web, whatsapp, db
docker compose exec api bin/rails console # Rails console (production)
docker compose restart api                # after editing .env
curl -s https://api.easalpha.com/api/v1/health   # "rls":true once Row-Level Security is set up
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
  `docker compose run --rm backup now`. A backup on the same disk is only half a backup: the shared server took its
  backups down with it in Nov 2026. Copy them off every night with rclone on the host (not `BACKUP_COPY_CMD`, which runs
  inside the postgres:16 backup container, where there is no rclone, rsync, ssh or curl):
  ```bash
  sudo apt install -y rclone     # deploy/server-setup.sh already did this
  rclone config        # add a remote named "offsite": Cloudflare R2 or Backblaze B2 (S3 type), or Google Drive
  crontab -e           # then this line: 23:30 UTC (the server's clock) is 04:30 in Pakistan, an hour after the backup
  30 23 * * * rclone copy /home/ubuntu-host/easalpha/backups offsite:easalpha-backups --max-age 3d >> /home/ubuntu-host/easalpha/offsite.log 2>&1
  ```
  Check it the next morning (`tail ~/easalpha/offsite.log`, `rclone ls offsite:easalpha-backups`), keep the bucket
  private (the wasessions files are as good as a password), and restore the latest dump into a scratch database once a
  month to know the backup works: `docker compose exec -T db createdb -U postgres restore_test`, `docker compose exec -T
  db pg_restore -U postgres -d restore_test < backups/easalpha-<date>.dump`, then `dropdb` it.
  Restore the database: `docker compose stop api jobs`, then
  `docker compose exec -T db pg_restore -U postgres --clean --if-exists -d easalpha_production < backups/easalpha-<date>.dump`,
  then `docker compose start api jobs`. Restore uploads: `docker run --rm -v easalpha_storage:/data/storage -v $PWD/backups:/b postgres:16 tar -xzf /b/storage-<date>.tar.gz -C /data`,
  then `docker compose up -d` (volume-owner gives the restored files back to uid 1000).
- **Paddle**: international card subscriptions arrive as webhooks at `POST /api/v1/webhooks/paddle`. The API refuses them
  (503) until `PADDLE_WEBHOOK_SECRET` is in `.env` (Paddle, Notifications, the endpoint's secret), and checks the signature
  and a five-minute freshness window on every event.
- **Errors**: set `SENTRY_DSN` in `.env` (a free sentry.io project) and the API reports exceptions there; blank means off.
- **Cache**: production uses Rails' file store. Solid Cache is configured (`config/cache.yml`, the `cache` database in
  `database.yml`) but off: the 29 Oct 2026 deploy that switched it on failed because the server's cache database existed
  empty (earlier `db:prepare` runs created it before the store used it, so its schema was never loaded). To switch it on:
  `docker compose exec api bin/rails db:schema:load:cache` once on the server, set `config.cache_store = :solid_cache_store`
  in `config/environments/production.rb`, deploy, and watch `GET /api/v1/health` (Rack::Attack reads the cache on every request).
- **Email**: the API sends a welcome email at signup and scheduled reports only when `SMTP_ADDRESS` is set in `.env`
  (with `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`). Create an account at a transactional provider (Resend, Postmark,
  Brevo or Amazon SES), verify the easalpha.com domain there (two DNS records they show you), paste the SMTP values and
  `docker compose up -d api jobs`. Check with `docker compose logs -f jobs` after a signup.
- **Resources**: the stack uses about 1 GB RAM next to the other app; `docker stats` shows it. `docker system prune -f`
  reclaims build layers and old images (the deploy job already prunes dangling images).

## Files

| File | Purpose |
|---|---|
| `deploy/docker-compose.yml` | the services (and the one-shot `volume-owner` and `umami-db-init`); builds from source when used alone |
| `deploy/docker-compose.images.yml` | overlay: use the ghcr.io images instead of building |
| `deploy/docker-compose.tunnel.yml` | overlay (production since 26 Nov 2026): cloudflared and Caddy in the stack, no port published |
| `deploy/caddy-tunnel/Caddyfile` | that Caddy's whole configuration, reloaded by every deploy |
| `deploy/docker-compose.caddy.yml` | overlay for a server with its own public address: Caddy on 80/443 with Let's Encrypt |
| `deploy/caddy/Caddyfile` | that Caddy's configuration |
| `deploy/server-setup.sh` | one-time root setup of a new server: Docker, docker group, log caps, rclone |
| `deploy/docker-compose.proxy.yml` | overlay for a server where another Caddy runs in Docker: no published ports, web and api join its network (`kamal` on the old shared server) |
| `deploy/backup.sh` | the nightly backup loop the `backup` service runs; `backup.sh now` for one backup |
| `deploy/Caddyfile.easalpha` | the site blocks to append to that other Caddy's file (proxy overlay only) |
| `deploy/.env.example` | template of the server's `~/easalpha/.env` (`COMPOSE_FILE` selects the overlays) |
| `.github/workflows/images.yml` | build after `ci` passes on `main`, on `v*` tags and on manual runs, then calls `deploy.yml` |
| `.github/workflows/deploy.yml` | the deploy (tailnet, SSH, pull, up, health check); also by hand to redeploy or roll back |
| `.github/workflows/desktop.yml` | installers on changes to `easalpha-desktop/` and on `v*` tags, uploaded to the Download page |
| `.github/workflows/ci.yml` | tests on every push and pull request |
| `scripts/github-setup.sh` | GitHub repo, secrets, variables, deploy key, push; again with a new `DEPLOY_HOST` to move servers |
| `scripts/server-env.sh` | writes a new server's `.env` with fresh secrets and the master key |
