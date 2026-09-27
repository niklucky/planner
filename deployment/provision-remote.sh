#!/usr/bin/env bash
# Runs provision.sh on the VPS over SSH as root.
#   deployment/provision-remote.sh root@1.2.3.4 production planner.spectron.dev you@example.com
set -euo pipefail
TARGET="${1:?usage: provision-remote.sh <root@host> <production|dev> <domain> <certbot-email>}"
ENV_NAME="${2:?}"; DOMAIN="${3:?}"; EMAIL="${4:?}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PUBKEY_FILE="$HERE/keys/github.pub"
[ -f "$PUBKEY_FILE" ] || { echo "missing $PUBKEY_FILE; run deployment/generate-keys.sh first"; exit 1; }

REMOTE_DIR=/root/planner-provision
ssh "$TARGET" "mkdir -p $REMOTE_DIR/nginx"
scp -q "$HERE/provision.sh" "$TARGET:$REMOTE_DIR/provision.sh"
scp -q "$HERE/nginx/site.conf.template" "$TARGET:$REMOTE_DIR/nginx/site.conf.template"
ssh -t "$TARGET" "PUBKEY='$(cat "$PUBKEY_FILE")' bash $REMOTE_DIR/provision.sh '$ENV_NAME' '$DOMAIN' '$EMAIL'"
