#!/usr/bin/env bash
# Provisions ONE Planner environment on a Debian/Ubuntu VPS. Run as root on the box
# (or through provision-remote.sh). Only adds things; never removes or overwrites
# anything that isn't Planner's own.
#
#   PUBKEY="ssh-ed25519 AAAA..." ./provision.sh <production|dev> <domain> <certbot-email>
#
# Layout per environment (production shown, dev uses /data/planner-dev and port 3001):
#   /data/planner            app home: docker-compose.yml + .env, owned by user "github"
#   /data/planner/db         postgres data (bind mount)
#   /data/planner/media      uploaded files (bind mount), also served by nginx at /media/
set -euo pipefail

ENV_NAME="${1:?usage: provision.sh <production|dev> <domain> <certbot-email>}"
DOMAIN="${2:?domain is required}"
EMAIL="${3:?certbot email is required}"
PUBKEY="${PUBKEY:?set PUBKEY to the deploy public key}"
DEPLOY_USER=github

case "$ENV_NAME" in
  production) APP_HOME=/data/planner;     PORT=3000 ;;
  dev)        APP_HOME=/data/planner-dev; PORT=3001 ;;
  *) echo "environment must be production or dev"; exit 1 ;;
esac
DB_DIR="$APP_HOME/db"
MEDIA_DIR="$APP_HOME/media"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\n==> %s\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
command -v apt-get >/dev/null || { echo "this script supports Debian/Ubuntu only"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

log "packages: nginx, certbot"
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx ca-certificates curl gnupg >/dev/null
systemctl enable --now nginx >/dev/null

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  log "docker already installed: $(docker --version)"
else
  log "docker: installing from Docker's apt repository"
  . /etc/os-release
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null
fi

log "deploy user: $DEPLOY_USER (in group docker)"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$AUTH"; chmod 600 "$AUTH"; chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH"
grep -qF "$PUBKEY" "$AUTH" || echo "$PUBKEY" >> "$AUTH"

log "directories under $APP_HOME"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_HOME"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$MEDIA_DIR"
# postgres in the official image runs as uid/gid 999
install -d -o 999 -g 999 -m 700 "$DB_DIR"
# nginx (www-data) must be able to traverse down to media. /data itself may be 700;
# o+x only allows passing through it, other projects' directories keep their own modes.
chmod o+x "$(dirname "$APP_HOME")"
chmod 755 "$APP_HOME" "$MEDIA_DIR"

log "nginx site for $DOMAIN"
SITE="/etc/nginx/sites-available/$DOMAIN.conf"
if [ -f "$SITE" ] && grep -q "managed by Certbot" "$SITE"; then
  echo "site config already has TLS from certbot; leaving it untouched"
else
  sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__PORT__#$PORT#g" -e "s#__MEDIA_DIR__#$MEDIA_DIR#g" \
    "$HERE/nginx/site.conf.template" > "$SITE"
fi
ln -sf "$SITE" "/etc/nginx/sites-enabled/$DOMAIN.conf"
nginx -t
systemctl reload nginx

log "TLS certificate for $DOMAIN"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "certificate already present"
elif certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  echo "certificate issued"
else
  echo "WARNING: certbot failed (is DNS for $DOMAIN pointing at this box yet?). Re-run later:"
  echo "   certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect"
fi

log "done"
cat <<SUMMARY
environment : $ENV_NAME
app home    : $APP_HOME  (deploy writes docker-compose.yml and .env here)
db dir      : $DB_DIR
media dir   : $MEDIA_DIR  (nginx serves it at https://$DOMAIN/media/)
app port    : 127.0.0.1:$PORT
deploy user : $DEPLOY_USER
SUMMARY
