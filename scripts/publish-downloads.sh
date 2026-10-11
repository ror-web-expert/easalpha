#!/usr/bin/env bash
# Puts the desktop installers on the website from this machine: builds the Linux installers (the only ones a Linux box
# can build), takes any Windows or Mac files already in servio-desktop/release/ (downloaded from the GitHub Actions
# "servio-pos-downloads" artifact), writes manifest.json and copies everything into the website's /downloads folder
# for local runs (servio-web/public/downloads) and for the server (deploy/downloads). Usage: scripts/publish-downloads.sh [--no-build]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${1:-}" != "--no-build" ]; then (cd "$ROOT/servio-desktop" && pnpm install --frozen-lockfile --silent && pnpm dist:linux); fi
STAGE="$(mktemp -d)"
find "$ROOT/servio-desktop/release" -maxdepth 1 -type f \( -name "*.exe" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.dmg" -o -name "*.zip" -o -name "*.yml" -o -name "*.blockmap" \) -exec cp {} "$STAGE/" \;
node "$ROOT/scripts/downloads-manifest.mjs" "$STAGE" "$ROOT/servio-desktop/package.json"
for DEST in "$ROOT/servio-web/public/downloads" "$ROOT/deploy/downloads"; do
  mkdir -p "$DEST"; cp "$STAGE"/* "$DEST/"
done
rm -rf "$STAGE"
echo "Installers copied to servio-web/public/downloads and deploy/downloads. The Download page reads manifest.json for the version."
