#!/usr/bin/env bash
# Creates the SSH key pair the GitHub deploy job uses to reach the VPS as user "github".
# Private key: deployment/keys/github (uploaded as SSH_PRIVATE_KEY by github-env.sh).
# Public key:  deployment/keys/github.pub (installed on the VPS by provision.sh).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/keys"
if [ -f "$HERE/keys/github" ]; then
  echo "key already exists at deployment/keys/github; delete it to regenerate"
else
  ssh-keygen -t ed25519 -N '' -C 'planner-github-deploy' -f "$HERE/keys/github"
fi
echo; echo "public key:"; cat "$HERE/keys/github.pub"
