# EasAlpha setup guide

Short steps for every way to run EasAlpha. Updated 11 Oct 2026. Logins after setup are in [TESTING-GUIDE.md](TESTING-GUIDE.md); day-to-day operations in [RUNBOOK.md](RUNBOOK.md).

## What runs

| Part | Folder | Port | Needs |
|---|---|---|---|
| API and job worker | `servio-api` | 3001 | Ruby 3.3.4, PostgreSQL 16 |
| Web app: admin, POS, kitchen, rider, storefront, public site | `servio-web` | 3000 | Node 20, pnpm 10 |
| WhatsApp gateway (link a phone by QR) | `servio-whatsapp` | 3010 | Node 20 |
| Desktop POS (Electron, printing, print server) | `servio-desktop` | 9977 | Node 20, pnpm 10 |

Secrets: `servio-api/config/master.key` is not in git. Copy it from the person who has it, or run `cd servio-api && bin/rails credentials:edit` once to make a new pair.

---

## 1. Developer machine

### Ubuntu 22.04 / 24.04

```bash
sudo apt update && sudo apt install -y git curl build-essential libpq-dev libyaml-dev docker.io docker-compose-v2
sudo usermod -aG docker $USER && newgrp docker
# Ruby 3.3.4 (rbenv)
sudo apt install -y rbenv && rbenv install 3.3.4 && rbenv global 3.3.4 && gem install bundler
# Node 20 + pnpm 10
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs && corepack enable && corepack prepare pnpm@10 --activate
```

### macOS 13+

```bash
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install rbenv ruby-build libpq libyaml node@20 pnpm
brew install --cask docker          # Docker Desktop; open it once
rbenv install 3.3.4 && rbenv global 3.3.4 && gem install bundler
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

### Then, on either

```bash
git clone <repo> servio && cd servio
scripts/dev-up.sh        # PostgreSQL in Docker, API + jobs, WhatsApp gateway, web (production build); prints URLs and logins
scripts/dev-down.sh      # stop (PostgreSQL keeps running)
```

Hot-reload development instead of the production build:

```bash
docker start servio-pg
cd servio-api && bin/dev                                              # API 3001 + jobs
cd servio-web && NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 pnpm dev   # web 3000
```

Rich demo data (30 days of orders, stock, payroll): `cd servio-api && bin/rails demo:rich`.

Tests: `cd servio-api && bundle exec rspec`, `cd servio-web && pnpm test && pnpm lint && pnpm typecheck`, browser gate `node scripts/e2e-web.mjs`.

---

## 2. Server with Docker (cloud VPS or on-site)

Works on any machine with Docker Compose v2: Ubuntu, Debian, any Linux, a Mac with Docker Desktop, Windows Server with Docker Desktop. Minimum 2 CPU, 4 GB RAM, 40 GB disk. One server runs everything; split later by pointing `PGHOST` at a managed PostgreSQL.

1. **Install Docker** (Ubuntu): `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER`. Mac and Windows: Docker Desktop.
2. **Get the code and the key**: `git clone <repo> servio && cd servio`, put `master.key` in `servio-api/config/`.
3. **Configure**: `cp deploy/.env.example deploy/.env` and fill in: `PUBLIC_URL`, `API_PUBLIC_URL`, `POSTGRES_PASSWORD`, `RAILS_MASTER_KEY` (contents of master.key), `WHATSAPP_GATEWAY_TOKEN`, `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`.
4. **Start**: `cd deploy && docker compose --env-file .env up -d --build`. First start creates the databases, runs migrations and creates the super admin.
5. **TLS**: put Caddy in front (`sudo apt install caddy`, then `/etc/caddy/Caddyfile`):
   ```
   pos.example.pk { reverse_proxy localhost:3000 }
   api.example.pk { reverse_proxy localhost:3001 }
   ```
   Point both DNS names at the server. Caddy gets the certificates itself. nginx or Traefik work the same way.
6. **Open the browser**: `https://pos.example.pk/signup` creates the first business and signs its owner in. `https://pos.example.pk/super` is the platform admin (plans, businesses, support).
7. **Check**: `curl https://api.example.pk/api/v1/health` and `docker compose ps` show everything up.

Prebuilt images instead of building on the server (faster, same result; the deploy job does exactly this): after CI has pushed images, set `IMAGE_REPO` and `IMAGE_TAG` in `.env` and run

```bash
cd deploy && docker compose --env-file .env -f docker-compose.yml -f docker-compose.images.yml pull
cd deploy && docker compose --env-file .env -f docker-compose.yml -f docker-compose.images.yml up -d
```

### Shop LAN without a domain

Same steps, but in `.env` set `FORCE_SSL=false`, `PUBLIC_URL=http://<server-ip>:3000`, `API_PUBLIC_URL=http://<server-ip>:3001`, skip the proxy, and give the server a fixed IP on the router. Tills, tablets, kitchen screens and rider phones open `http://<server-ip>:3000`. Push notifications and "install to home screen" need HTTPS, so use the proxy with a real domain when phones matter.

### Without Docker (Ubuntu, systemd)

Install Ruby, Node and PostgreSQL 16 as in section 1, then: `cd servio-api && bundle install --without development test && RAILS_ENV=production bin/rails db:prepare db:seed`; `cd servio-web && pnpm install && NEXT_PUBLIC_API_URL=https://api.example.pk/api/v1 pnpm build`. Run four services under systemd: `bin/rails server -p 3001`, `bin/jobs`, `pnpm start -p 3000`, `node server.js` (gateway), each with the same environment variables as `deploy/docker-compose.yml`. Docker is the supported path; use this only when Docker is not allowed.

---

## 3. Setting up each machine (one app, one login, then only its screen)

Every till, tablet, kitchen screen, token screen and rider phone runs the same app and gets its role on first open:

1. Open the app: the desktop installer, or `https://pos.example.pk/setup` in the browser (install it to the home screen on phones and tablets).
2. The owner or a manager signs in with email and password. The login is used once and is not kept on the machine.
3. Pick what the machine is: Till, Order-taker tablet, Kitchen display, Token screen, Queue screen or Rider phone, the branch, and a name such as "Counter 1".
4. The ready screen lists who can sign in on it and whether each person has a PIN. Set or reset a PIN there.
5. Press Open. From now on the machine opens that screen with its PIN pad every time. Staff never see the admin login.

To change a machine's role: EasAlpha menu > "Set up this device again" on the desktop, or open `/setup?again=1` in the browser. Admin › Devices shows every machine and can revoke one remotely. The 6-digit pairing code still works as a fallback when no manager is at the machine.

## 4a. The Download page and automatic uploads

`/download` on the website detects the visitor's operating system and offers the matching installer; the links point at the site's own `/downloads` folder, so they are `http://localhost:3000/downloads/...` in development and `https://your-domain/downloads/...` once live.

**Automatic (recommended).** Tag a release and the `desktop` workflow builds Windows, Linux and Mac installers on GitHub's runners, writes `manifest.json` and uploads the folder to your server, where the web container serves it at `/downloads`. The Download page reads the manifest, so the version and the file list update by themselves. One-time setup in the repository (Settings, Secrets and variables, Actions):

| Where | Name | Value |
|---|---|---|
| Secret | `DEPLOY_HOST` | the server, e.g. `pos.easalpha.com` or its IP |
| Secret | `DEPLOY_USER` | the SSH user that owns the deploy folder |
| Secret | `DEPLOY_SSH_KEY` | a private key whose public half is in that user's `~/.ssh/authorized_keys` (`ssh-keygen -t ed25519 -f deploy_key`) |
| Secret | `DEPLOY_DOWNLOADS_PATH` | the folder mounted into the web container, e.g. `/srv/servio/deploy/downloads` |
| Variable | `PUBLIC_URL` | the website, e.g. `https://easalpha.com`; installed apps then update themselves from `PUBLIC_URL/downloads` |

Then: bump `"version"` in `servio-desktop/package.json`, `git tag v1.0.0 && git push --tags`. About 15 minutes later the three installers are on the site. Without the secrets the workflow still builds and keeps the files as the `servio-pos-downloads` artifact and on the GitHub Release.

**By hand.** `scripts/publish-downloads.sh` builds the Linux installers here, picks up any Windows or Mac files you dropped into `servio-desktop/release/` (from the workflow artifact), writes `manifest.json` and copies everything into `servio-web/public/downloads` (local site) and `deploy/downloads` (copy that folder to the server). Only when the installers live somewhere else entirely set Downloads URL in the super panel; the Desktop version there is the fallback when no manifest exists.

## 4. Desktop POS installers

The desktop app wraps the web POS and adds receipt printing and the print server for tablets. It opens `http://localhost:3000/setup` by default; change the address once in EasAlpha > Printers (Ctrl+Shift+P) to your `PUBLIC_URL`.

| Target | Build on | Command | Output in `servio-desktop/release/` |
|---|---|---|---|
| Linux | Linux | `pnpm dist:linux` | `EasAlpha POS-x.y.z.AppImage`, `servio-desktop_x.y.z_amd64.deb` |
| Windows | Windows (or Linux with Wine) | `pnpm dist:win` | `EasAlpha POS Setup x.y.z.exe` |
| macOS Intel + Apple Silicon | macOS | `pnpm dist:mac` | `EasAlpha POS-x.y.z.dmg`, `.zip` |

Before the first build: `cd servio-desktop && pnpm install`. Installers are unsigned, so Windows SmartScreen says "More info, Run anyway" and macOS needs right-click, Open the first time. Code signing certificates (a Windows EV cert, an Apple Developer ID) remove those warnings; add them as CI secrets `CSC_LINK` and `CSC_KEY_PASSWORD` when bought.

Install on a till: Linux `sudo apt install ./servio-desktop_*.deb` or run the AppImage; Windows run the .exe; macOS open the .dmg and drag to Applications. Give the till a fixed IP so tablets keep printing through it.

---

## 5. Automatic builds on every change (GitHub Actions)

Push the repository to GitHub and the three workflows in `.github/workflows/` run on their own:

| Workflow | Runs when | Produces |
|---|---|---|
| `ci.yml` | every push and pull request | API specs, rubocop, brakeman; web lint, typecheck, unit tests; desktop unit tests |
| `images.yml` | push to `main`/`master`, any `v*` tag | Docker images `ghcr.io/<owner>/servio-api`, `servio-web`, `servio-whatsapp`, tagged `latest`, the git tag and the commit SHA |
| `desktop.yml` | any change under `servio-desktop/`, any `v*` tag | Linux AppImage and deb, Windows exe, macOS dmg and zip as downloadable artifacts (30 days); a `v*` tag also attaches them to a GitHub Release |

One-time setup on GitHub: `scripts/github-setup.sh` (after `gh auth login`) creates the repository, sets the `API_PUBLIC_URL` and `PUBLIC_URL` variables and the `DEPLOY_*` secrets, and pushes. With those secrets `images.yml` also deploys: it copies `deploy/` to the server, logs the server into ghcr.io with the run's token, pulls and restarts the stack, and waits for the API health check. The production server, DNS and Caddy steps are in [DEPLOY.md](DEPLOY.md).

Release flow: bump `"version"` in `servio-desktop/package.json`, then `git tag v1.0.0 && git push --tags`. Images and installers for that version appear on the GitHub Release within about 15 minutes.

**Self-update.** Installed desktop apps check the release feed 20 seconds after start and every 4 hours, download the new version in the background and install it when the app is closed, so a shift is never interrupted; a prompt offers "Restart now". The feed is this repository's latest GitHub Release (set by the workflow) or the `updateUrl` in `settings.json` for self-hosted customers who publish `latest.yml` and the installers on their own server. Works for the Windows installer and the Linux AppImage; the Linux .deb is updated by hand and macOS needs a signed build. The web app, kitchen screens and phones update on reload because they load from the server.

---

## 6. Update, back up, restore

- **Update a Docker server**: `git pull && cd deploy && docker compose --env-file .env up -d --build` (or `pull` then `up -d` with the images file). Migrations run on start. Do it between 3 pm and 5 pm Pakistan time, outside shifts.
- **Back up**: `docker compose exec db pg_dump -U postgres servio_production | gzip > servio-$(date +%F).sql.gz`, plus the `storage` volume (uploads) and `wasessions` (linked WhatsApp phone). Run it nightly from cron and copy off the server.
- **Restore**: `gunzip -c servio-DATE.sql.gz | docker compose exec -T db psql -U postgres servio_production`.
- **Logs**: `docker compose logs -f api` (or `jobs`, `web`, `whatsapp`). Local runs log to `tmp/logs/`.
