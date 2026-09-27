#!/usr/bin/env bash
# Uploads deployment/.env.<env> to the GitHub environment of the same name.
# Lines ending in "# public" become variables, everything else becomes secrets.
# Also uploads SSH_PRIVATE_KEY from deployment/keys/github.
#   deployment/github-env.sh production
set -euo pipefail
ENV_NAME="${1:?usage: github-env.sh <production|dev>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$HERE/.env.$ENV_NAME"
KEY_FILE="$HERE/keys/github"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy from .env.production.example)"; exit 1; }
[ -f "$KEY_FILE" ] || { echo "missing $KEY_FILE; run deployment/generate-keys.sh first"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "repo: $REPO, environment: $ENV_NAME"
gh api -X PUT "repos/$REPO/environments/$ENV_NAME" --silent

secrets=0; vars=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%$'\r'}"
  [[ -z "${line// }" || "$line" =~ ^[[:space:]]*# ]] && continue
  public=0
  if [[ "$line" =~ \#[[:space:]]*public[[:space:]]*$ ]]; then
    public=1
    line="${line%%#*}"
  fi
  key="${line%%=*}"; value="${line#*=}"
  key="$(echo "$key" | xargs)"; value="$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "skipping odd line: $line"; continue; }
  [ -n "$value" ] || { echo "skipping $key (empty)"; continue; }
  if [ "$public" = 1 ]; then
    gh variable set "$key" --env "$ENV_NAME" --body "$value"; vars=$((vars+1))
  else
    gh secret set "$key" --env "$ENV_NAME" --body "$value"; secrets=$((secrets+1))
  fi
done < "$ENV_FILE"

gh secret set SSH_PRIVATE_KEY --env "$ENV_NAME" < "$KEY_FILE"; secrets=$((secrets+1))
echo "uploaded $secrets secrets and $vars variables to environment '$ENV_NAME'"
