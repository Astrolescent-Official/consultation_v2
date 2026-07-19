# Production and preview environments

## Isolation matrix

| Concern | Production | Preview |
| --- | --- | --- |
| Worker | `consultation` | `consultation-preview` |
| D1 | `consultation-votes-production` | `consultation-votes-preview` |
| Radix network | Mainnet (`1`) | Stokenet (`2`) |
| Governance config | `GovernanceConfig.MainnetLive` | `GovernanceConfig.StokenetLive` |
| Poll schedule | Every 5 minutes | Every 10 minutes |
| Initial cursor | Current ledger state | Current ledger state |

The databases start empty by design. There is no PostgreSQL data migration because the dApp had no users when this platform change was approved.

## Local development

```sh
cp apps/consultation/.env.test.local.example apps/consultation/.env.test.local
pnpm --filter consultation-dapp d1:migrate:local
pnpm --filter consultation-dapp dev
```

The local Worker uses local D1 state under `apps/consultation/.wrangler/`. The two API routes are same-origin, so no backend URL or CORS configuration is needed.

## Preview release

1. Set the Stokenet dApp definition address in `.env.test.local` or the build environment.
2. Run `pnpm deploy:preview`.
3. Verify `/.well-known/radix.json`, `/vote-results`, and `/account-votes` on the preview Worker.
4. Confirm the preview D1 cursor advances and the scheduled handler has no errors.

The stable preview Worker is the wallet-test origin. Branch preview URLs are suitable for read-only UI review unless each origin is also claimed in Radix metadata.

## Production release

1. Run the Worker/D1 tests and production build.
2. Run `pnpm deploy:production`.
3. Verify the well-known file and both same-origin vote APIs.
4. Trigger or observe one scheduled poll and confirm the D1 cursor advances.
5. Check Worker structured logs for lease, Gateway, D1, or timeout failures.

The deploy script applies D1 migrations before deploying code. Schema changes must therefore remain compatible with the currently deployed Worker until deployment finishes.
