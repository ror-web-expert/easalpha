# Deploying EasAlpha: the short version

The whole runbook (moving servers, backups, restore, daily operations) is [docs/DEPLOY.md](docs/DEPLOY.md).

## How a change reaches easalpha.com

```
git push (main) -> ci.yml (tests) -> images.yml (4 images -> ghcr.io) -> deploy.yml
deploy.yml: join the tailnet as tag:ci -> SSH to 100.87.45.11 -> copy deploy/ -> pull images -> docker compose up -d
            -> wait for /api/v1/health -> reload Caddy -> remove old images
```

The server is `ubuntu-host`, an office VM behind NAT, reached only over Tailscale (100.87.45.11). The app lives in
`~/easalpha`. Visitors come in through the Cloudflare Tunnel `easalpha`: the `cloudflared` container dials out to
Cloudflare and hands easalpha.com, www and api to `http://caddy:80` in the same stack. No port is published, and no
router or firewall change is needed. Migrations and seeds run when the api container starts.

Redeploy, or roll back to an earlier release without a rebuild:

```bash
gh workflow run deploy --ref main                   # the head of main again
gh workflow run deploy --ref main -f tag=<sha>      # an earlier commit's images and deploy files
```

## GitHub secrets

Settings, Secrets and variables, Actions. `scripts/github-setup.sh` sets all of them:
`DEPLOY_HOST=100.87.45.11 DEPLOY_USER=ubuntu-host TS_OAUTH_CLIENT_ID=... TS_OAUTH_SECRET=... scripts/github-setup.sh`

| Secret | Value |
|---|---|
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | Tailscale OAuth client, scope Auth Keys (write), tag `tag:ci` |
| `DEPLOY_SSH_KEY` | the private deploy key (`~/.ssh/easalpha_deploy` on the laptop); its public half is in the server's `~/.ssh/authorized_keys` |
| `DEPLOY_USER` | `ubuntu-host` |
| `DEPLOY_KNOWN_HOSTS` | the server's host keys, one line each: `100.87.45.11 ssh-ed25519 AAAA...` |
| `DEPLOY_HOST` | `100.87.45.11` |
| `DEPLOY_PATH` | `/home/ubuntu-host/easalpha` |
| `DEPLOY_DOWNLOADS_PATH` | `/home/ubuntu-host/easalpha/downloads` (desktop installers) |

Variables: `API_PUBLIC_URL=https://api.easalpha.com`, `PUBLIC_URL=https://easalpha.com`.

`DEPLOY_KNOWN_HOSTS` by hand, read from the server itself:
`ssh ubuntu-host@100.87.45.11 'cat /etc/ssh/ssh_host_*_key.pub' | awk '{print "100.87.45.11", $1, $2}'`

The deploy uses the server's normal OpenSSH, not Tailscale SSH (which does not admit `tag:ci`): keep Tailscale SSH off
on ubuntu-host.

## The server's `.env`

`~/easalpha/.env`, mode 600, never in git (`.gitignore` ignores `.env` and `.env.*`; only `deploy/.env.example`, the
template, is committed). `scripts/server-env.sh` writes a new one with fresh secrets. Keep a copy in a password manager.

| Variable | |
|---|---|
| `TUNNEL_TOKEN` | the Cloudflare tunnel's token (Zero Trust, Networks, Tunnels, easalpha: the value after `--token`) |
| `COMPOSE_FILE` | `docker-compose.yml:docker-compose.images.yml:docker-compose.tunnel.yml` |
| `IMAGE_REPO`, `IMAGE_TAG` | written by every deploy |
| `RAILS_MASTER_KEY` | `easalpha-api/config/master.key`; keep the same one when old data is restored |
| `POSTGRES_PASSWORD`, `WHATSAPP_GATEWAY_TOKEN`, `UMAMI_APP_SECRET` | random secrets |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | the first super admin, created on a fresh database |
| `PUBLIC_URL`, `API_PUBLIC_URL` | `https://easalpha.com`, `https://api.easalpha.com` |
| optional | `SMTP_*`, `PADDLE_WEBHOOK_SECRET`, `SENTRY_DSN`, `EASALPHA_APP_DB_PASSWORD`, `WHATSAPP_*`, `VAPID_*` |

## One-time server setup

1. Docker, the docker group, log caps and rclone: `sudo bash deploy/server-setup.sh` on the server, then log out and in.
2. The deploy user: production uses `ubuntu-host`, which is in the docker group. A separate user instead:
   `sudo adduser --disabled-password --gecos "" deploy && sudo usermod -aG docker deploy`, then set `DEPLOY_USER` and
   `DEPLOY_PATH` to match. The docker group can control everything Docker can, so treat that user's key like a root key.
3. Its key: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/easalpha_deploy` on the laptop, then
   `ssh-copy-id -i ~/.ssh/easalpha_deploy.pub <user>@100.87.45.11` (`scripts/github-setup.sh` does both).
4. The `.env`: `scripts/server-env.sh`, add `TUNNEL_TOKEN`, then `scp ~/easalpha-server.env <user>@100.87.45.11:easalpha/.env`
   and `chmod 600 ~/easalpha/.env` on the server.
5. First start: `gh workflow run deploy --ref main`. It copies the compose files, logs the server into ghcr.io, pulls
   and runs `docker compose up -d`. After that, `cd ~/easalpha && docker compose up -d` also works by hand.
6. Check on the server: `docker compose ps`, `docker compose logs cloudflared | grep -i registered` (four connections),
   and from anywhere: `curl -s https://api.easalpha.com/api/v1/health`.
