#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?Usage: ./deploy.sh <preview|production>}"
# Wrangler's named-environment D1 commands require an explicit account when
# the authenticated profile can access more than one Cloudflare account.
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-cdb0453c60d48cf58f44f34f9eb6bbe2}"

case "$TARGET" in
  preview)
    pnpm --filter consultation-dapp d1:migrate:preview
    pnpm --filter consultation-dapp run deploy:preview
    ;;
  production)
    pnpm --filter consultation-dapp d1:migrate:production
    pnpm --filter consultation-dapp run deploy
    ;;
  *)
    echo "Unknown target: $TARGET (expected preview or production)" >&2
    exit 1
    ;;
esac
