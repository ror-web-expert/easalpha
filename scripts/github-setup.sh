#!/usr/bin/env bash
# One-time GitHub setup for EasAlpha: creates the private repository, sets the deploy secrets and variables the workflows
# use, installs the deploy key on the server and pushes the code (which triggers the first build and deploy).
#
#   gh auth login                      # once, in a browser
#   scripts/github-setup.sh            # defaults below; override with env vars, e.g. REPO=myorg/servio
#
# Secrets set:   DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_PATH, DEPLOY_DOWNLOADS_PATH
# Variables set: API_PUBLIC_URL (baked into the web image), PUBLIC_URL (desktop installers' update feed)
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${REPO:-servio}"                              # "name" (under your user) or "owner/name"
VISIBILITY="${VISIBILITY:-private}"
DEPLOY_HOST="${DEPLOY_HOST:-103.173.62.218}"
DEPLOY_USER="${DEPLOY_USER:-sajid}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/$DEPLOY_USER/servio}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/servio_deploy}"   # private key; public half goes to the server
PUBLIC_URL="${PUBLIC_URL:-https://easalpha.com}"
API_PUBLIC_URL="${API_PUBLIC_URL:-https://api.easalpha.com}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

command -v gh >/dev/null || { echo "gh (GitHub CLI) is not installed: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Not logged in: run 'gh auth login' first"; exit 1; }

[ -f "$DEPLOY_KEY" ] || ssh-keygen -t ed25519 -N "" -C "servio-deploy@github-actions" -f "$DEPLOY_KEY" -q
echo "1/5 Deploy key on the server ($DEPLOY_USER@$DEPLOY_HOST)"
ssh-copy-id -i "$DEPLOY_KEY.pub" "$DEPLOY_USER@$DEPLOY_HOST" >/dev/null 2>&1 || true
ssh -i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p '$DEPLOY_PATH/downloads' && echo '   key works'"

echo "2/5 Repository $REPO ($VISIBILITY)"
if git remote get-url origin >/dev/null 2>&1; then
  echo "   origin already set: $(git remote get-url origin)"
  FULL="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
else
  gh repo create "$REPO" "--$VISIBILITY" --source . --remote origin >/dev/null
  FULL="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
  echo "   created https://github.com/$FULL"
fi

echo "3/5 Secrets"
gh secret set DEPLOY_HOST --repo "$FULL" --body "$DEPLOY_HOST"
gh secret set DEPLOY_USER --repo "$FULL" --body "$DEPLOY_USER"
gh secret set DEPLOY_PATH --repo "$FULL" --body "$DEPLOY_PATH"
gh secret set DEPLOY_DOWNLOADS_PATH --repo "$FULL" --body "$DEPLOY_PATH/downloads"
gh secret set DEPLOY_SSH_KEY --repo "$FULL" < "$DEPLOY_KEY"

echo "4/5 Variables"
gh variable set API_PUBLIC_URL --repo "$FULL" --body "$API_PUBLIC_URL"
gh variable set PUBLIC_URL --repo "$FULL" --body "$PUBLIC_URL"

echo "5/5 Push $BRANCH (starts the ci, images and desktop workflows)"
git push -u origin "$BRANCH"
echo
echo "Done. Watch the first deploy:  gh run watch   (or https://github.com/$FULL/actions)"
echo "Server .env must exist at $DEPLOY_PATH/.env (deploy/.env.example is the template)."
