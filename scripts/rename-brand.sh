#!/usr/bin/env bash
# Renames the project from Servio to EasAlpha: every git-tracked text file (Servio -> EasAlpha, SERVIO -> EASALPHA,
# servio -> easalpha), then the folders servio-api, servio-web, servio-desktop, servio-whatsapp and lib/servio.
# Skipped: docs/archive (history), screenshots, binaries, and the workspace path "company-servio".
# Reversible: the tag "pre-rename" marks the state before; `git checkout pre-rename -- . && git clean -fd` undoes it.
# Afterwards (see docs/DEPLOY.md and the PR notes): rename the local dev databases, rebuild images, re-create ~/easalpha on the server.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain | grep -v rename-brand.sh)" ]; then
  echo "Note: uncommitted changes exist; they are kept (the rename only edits text files and moves folders)."
fi
git tag -f pre-rename >/dev/null

python3 - <<'EOF'
import subprocess
files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
skip_dirs = ("docs/archive/", "screenshots/", "tmp/")
skip_ext = (".pdf", ".png", ".jpg", ".jpeg", ".ico", ".deb", ".appimage", ".woff", ".woff2", ".ttf", ".gif", ".webp")
changed = 0
for f in files:
    if not f or f.startswith(skip_dirs) or f.lower().endswith(skip_ext): continue
    try: s = open(f, encoding="utf-8").read()
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError): continue
    if "servio" not in s.lower(): continue
    t = s.replace("company-servio", "company-@@KEEP@@")
    t = t.replace("Servio", "EasAlpha").replace("SERVIO", "EASALPHA").replace("servio", "easalpha")
    t = t.replace("company-@@KEEP@@", "company-servio")
    if t != s:
        open(f, "w", encoding="utf-8").write(t); changed += 1
print(f"text: {changed} files changed")
EOF

git mv servio-api/lib/servio servio-api/lib/easalpha
git mv servio-api easalpha-api
git mv servio-web easalpha-web
git mv servio-desktop easalpha-desktop
git mv servio-whatsapp easalpha-whatsapp
for f in deploy/downloads/servio-desktop_*_amd64.deb easalpha-web/public/downloads/servio-desktop_*_amd64.deb; do
  [ -f "$f" ] && mv "$f" "${f/servio-desktop/easalpha-desktop}"
done

echo "folders: easalpha-api easalpha-web easalpha-desktop easalpha-whatsapp"
echo "leftovers (should be only the workspace path):"
grep -rn -i "servio" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=release \
  --exclude-dir=dist --exclude-dir=out --exclude-dir=tmp --exclude-dir=log --exclude-dir=archive --exclude-dir=screenshots -I \
  | grep -v "company-servio" | head -20 || true
echo "done: $(git status --short | wc -l) paths changed. Review with 'git diff --stat', then tell Claude to continue (tests, images, server)."
