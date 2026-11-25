#!/usr/bin/env bash
# One-time preparation of an EasAlpha server (Ubuntu 24.04), run once as root by the person who has the sudo password:
#   sudo bash ~/easalpha/server-setup.sh            (then log out and in again, so the docker group applies)
# It installs Docker Engine and Compose v2 from Docker's own apt repository (not the snap: the old server's snap Docker
# hid /tmp and kept its data under /var/snap), lets the deploy user run docker, caps container log files, installs
# rclone for the off-server backup copy, and makes ~/easalpha. Running it again changes nothing. Written 26 Nov 2026
# for the move to the office VM (docs/DEPLOY.md, "Moving to a new server").
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run it with sudo: sudo bash $0"; exit 1; }
DEPLOY_USER="${1:-${SUDO_USER:-}}"
[ -n "$DEPLOY_USER" ] && id "$DEPLOY_USER" >/dev/null 2>&1 || { echo "Name the deploy user: sudo bash $0 <user>"; exit 1; }
HOME_DIR="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
. /etc/os-release

echo "1/5 Docker Engine and Compose v2"
if ! docker compose version >/dev/null 2>&1; then
  apt-get update -q
  apt-get install -y -q ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "2/5 Container logs capped (10 MB x 3 files per container)"
# Docker's default json-file log grows without end; on a long-running server it fills the disk.
if [ ! -s /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' > /etc/docker/daemon.json
  systemctl restart docker 2>/dev/null || true
else
  echo "   /etc/docker/daemon.json exists; left as it is"
fi
systemctl enable --now docker >/dev/null

echo "3/5 $DEPLOY_USER may run docker"
usermod -aG docker "$DEPLOY_USER"

echo "4/5 rclone (nightly copy of the backups off this machine)"
command -v rclone >/dev/null || apt-get install -y -q rclone

echo "5/5 $HOME_DIR/easalpha"
install -d -o "$DEPLOY_USER" -g "$(id -gn "$DEPLOY_USER")" "$HOME_DIR/easalpha" "$HOME_DIR/easalpha/downloads"

echo
docker --version && docker compose version
echo "Done. $DEPLOY_USER must log out and in again (or run: newgrp docker) before docker works without sudo."
