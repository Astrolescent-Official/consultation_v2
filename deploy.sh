#!/usr/bin/env bash
set -euo pipefail

ENV="${1:?Usage: ./deploy.sh <test|stokenet|mainnet>}"

case "$ENV" in
  test)
    ENV_FILE=".env.test"
    SST_SCRIPT="sst:deploy:test"
    ;;
  stokenet)
    ENV_FILE=".env.stokenet"
    SST_SCRIPT="sst:deploy:stokenet"
    ;;
  mainnet)
    ENV_FILE=".env.mainnet"
    SST_SCRIPT="sst:deploy:mainnet"
    ;;
  *)
    echo "Unknown environment: $ENV (expected test, stokenet or mainnet)" >&2
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy $ENV_FILE.example and fill in its placeholders." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"
export DATABASE_URL NETWORK_ID ENV POLL_SCHEDULE POLL_TIMEOUT_DURATION

pnpm turbo run db:migrate
pnpm --filter vote-collector "$SST_SCRIPT"
