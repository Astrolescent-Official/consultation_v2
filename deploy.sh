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
    # The migration namespaces legacy rows with an empty address. Drop only
    # those preview cache rows: a component redeployment restarts IDs, so they
    # cannot safely be attributed to the current component.
    pnpm --filter consultation-dapp exec wrangler d1 execute DB --remote --env preview --command "DELETE FROM vote_calculation_account_votes WHERE state_id IN (SELECT id FROM vote_calculation_state WHERE governance_component_address = ''); DELETE FROM vote_calculation_results WHERE state_id IN (SELECT id FROM vote_calculation_state WHERE governance_component_address = ''); DELETE FROM vote_calculation_state WHERE governance_component_address = '';"
    ;;
  production)
    pnpm --filter consultation-dapp d1:migrate:production
    pnpm --filter consultation-dapp run deploy
    # The migration initially namespaces legacy rows with an empty address.
    # Preserve the active mainnet component's cache once old Worker versions
    # can no longer create unscoped rows.
    pnpm --filter consultation-dapp exec wrangler d1 execute DB --remote --command "UPDATE vote_calculation_state SET governance_component_address = 'component_rdx1cz8tzcyyj9zlactrq9nqcnnagg56fn84p4e73gvlzp2s6krde89k9y' WHERE governance_component_address = '';"
    ;;
  *)
    echo "Unknown target: $TARGET (expected preview or production)" >&2
    exit 1
    ;;
esac
