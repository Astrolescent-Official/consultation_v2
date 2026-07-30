#!/usr/bin/env sh
set -eu
: "${CLOUDFLARE_PREVIEW_ALIAS:?Set CLOUDFLARE_PREVIEW_ALIAS to a valid Worker preview alias}"
pnpm --filter consultation-dapp d1:migrate:preview
pnpm --filter consultation-dapp run build:preview
pnpm --filter consultation-dapp exec wrangler versions upload --config dist/server/wrangler.json --preview-alias "$CLOUDFLARE_PREVIEW_ALIAS"
