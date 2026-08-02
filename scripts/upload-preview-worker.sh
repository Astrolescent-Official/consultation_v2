#!/usr/bin/env sh
set -eu
: "${CLOUDFLARE_PREVIEW_ALIAS:?Set CLOUDFLARE_PREVIEW_ALIAS to a valid Worker preview alias}"
pnpm --filter consultation-dapp d1:migrate:preview
pnpm --filter consultation-dapp run build:preview
deployment_output=$(pnpm --filter consultation-dapp exec wrangler versions upload --config dist/server/wrangler.json --preview-alias "$CLOUDFLARE_PREVIEW_ALIAS" 2>&1) || {
	printf '%s\n' "$deployment_output"
	exit 1
}
printf '%s\n' "$deployment_output"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
	preview_url=$(printf '%s\n' "$deployment_output" | awk -v alias="$CLOUDFLARE_PREVIEW_ALIAS" '
		match($0, "https://" alias "-[^[:space:]]*\\.workers\\.dev") {
			print substr($0, RSTART, RLENGTH)
			exit
		}
	')
	: "${preview_url:?Wrangler did not return the named preview URL}"
	printf 'preview-url=%s\n' "$preview_url" >> "$GITHUB_OUTPUT"
fi
