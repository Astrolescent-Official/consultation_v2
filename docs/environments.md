# Production, test, and preview environments

## Environment matrix

| Concern | Production | Test | Branch preview |
| --- | --- | --- | --- |
| Radix network | Mainnet (`1`) | Stokenet (`2`) | Stokenet (`2`) |
| Governance components | `GovernanceConfig.MainnetLive` | `GovernanceConfig.StokenetLive` | Same as test |
| PlanetScale | `main` production branch (PS-5) | `test` development branch (PS-DEV) | Same as test |
| AWS SST stage | `production` | `test` | Same as test |
| Poll interval | 5 minutes | 5 minutes | N/A |
| Cloudflare | Active `consultation` deployment | Stable `test-consultation...workers.dev` preview alias | Automatic branch/version preview URL |

Production is protected and retained by SST. The test stage is removable and
uses separate AWS resources because SST prefixes resources with the stage.

## 1. PlanetScale branches

Create one PlanetScale Postgres database with:

1. A `main` PS-5 production branch.
2. An empty `test` development branch.
3. A separate application role for each branch.

PlanetScale Postgres branches are isolated databases; data does not replicate
between them. New development branches are empty, so run the Drizzle migrations
against each branch. A database includes two branch-months of PS-DEV usage before
development branch overage, which makes one continuously running test branch fit
within the included development hours.

Documentation:

- https://planetscale.com/docs/postgres/branching
- https://planetscale.com/docs/planetscale-plans#postgres-development-branches

## 2. AWS test backend

Copy the environment template and replace the PlanetScale connection URL:

```sh
cp .env.test.example .env.test
pnpm deploy:vote-collector:test
```

The deploy command migrates only the test database branch, then deploys a
separate `test` API Gateway, polling Lambda, and five-minute EventBridge schedule.
Copy the `api` output into the frontend test environment.

The production deployment remains:

```sh
pnpm deploy:vote-collector:mainnet
```

## 3. Stable Cloudflare test preview

The Radix wallet checks the website origin against dApp definition metadata. Use
one stable preview alias for wallet testing rather than claiming every temporary
branch URL.

1. Create a Stokenet dApp definition account.
2. Claim `https://test-consultation.radixdao.workers.dev` in its metadata.
3. Link `GovernanceConfig.StokenetLive`'s component back to that dApp definition.
4. Copy `apps/consultation/.env.test.local.example` to `.env.test.local`.
5. Set the Stokenet dApp definition and test API URL.
6. Run `pnpm --filter consultation-dapp upload:preview`.

`wrangler versions upload --preview-alias test` updates the stable preview without
promoting it to the active production deployment.

## 4. Automatic Cloudflare branch previews

Connect the existing `consultation` Worker to the GitHub repository under
**Worker > Settings > Builds** with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `apps/consultation` |
| Build command | `pnpm build` for production; preview trigger uses the variables below |
| Production deploy command | `pnpm exec wrangler deploy` |
| Non-production deploy command | `pnpm exec wrangler versions upload` |

Set these environment variables on the non-production build trigger:

```text
CLOUDFLARE_ENV=preview
VITE_ENV=staging
VITE_PUBLIC_NETWORK_ID=2
VITE_PUBLIC_DAPP_DEFINITION_ADDRESS=<STOKENET_DAPP_DEFINITION>
VITE_VOTE_COLLECTOR_URL=<TEST_API_URL>
```

Cloudflare will create a unique URL for every commit and a stable alias for each
branch. These previews never become the active production deployment. Because
their hostnames are dynamic, use them for read-only UI review; use the stable
`test` alias for wallet transactions.

Documentation:

- https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/
