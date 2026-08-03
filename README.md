# Consultation

Radix governance consultation dApp running entirely on Cloudflare Workers and D1.

## Architecture

- TanStack Start serves the React dApp from the Worker.
- `GET /vote-results`, `GET /account-votes`, and
  `GET /majority-judgment-election` are same-origin Worker routes.
- the Worker's scheduled handler polls the Radix Gateway every minute in production.
- Cloudflare D1 stores the cursor, lease, exact vote totals, and account votes.
- production and preview use separate Workers, D1 databases, Radix networks, variables, and schedules.

Governance quorums for Temperature Checks, Governance Proposals, and Majority
Judgment elections are fixed XRD amounts. Circulating supply cannot be calculated
reliably on-chain, so administrators are responsible for keeping the quorum
amounts in governance parameter sets up to date over time.

The current component schema uses named governance parameter sets and is not
compatible with the earlier singleton-parameter development component. For a
launch or Stokenet rollout, publish a fresh package, instantiate a fresh
Governance component, seed its approved parameter sets, then update the shared
configuration before deploying the consultation Worker.
There is no legacy component-data migration path.

## Local development

```sh
pnpm install
pnpm --filter consultation-dapp d1:migrate:local
pnpm --filter consultation-dapp dev
```

The app and all three vote APIs are available on `http://localhost:3000`.

## Verification

```sh
pnpm check
pnpm check-types
pnpm test:unit
pnpm test:worker
pnpm test:scrypto
```

The Worker test suite runs against local workerd and D1. It covers exact decimal persistence, revotes, atomic rollback, numeric ordering, and poll-lease ownership.

## Deployment

GitHub Actions deployments require a repository secret named
`CLOUDFLARE_API_TOKEN`, plus `CLOUDFLARE_ACCOUNT_ID` as either a repository
variable or secret. Both must correspond to the Cloudflare account that owns
the production and preview Workers and their D1 databases.

The macOS self-hosted runner used by the `Verify` job requires Homebrew LLVM
(`brew install llvm`). The job uses `/opt/homebrew/opt/llvm/bin/clang` to build
Scrypto's `wasm32-unknown-unknown` target because Apple clang does not support
that target.

Pushes to `main` deploy production after the `Verify` job succeeds. Other
branches upload a version to the isolated preview Worker with a stable branch
preview alias; they do not replace the production deployment.

```sh
pnpm deploy:preview
pnpm deploy:production
```

Each command applies pending D1 migrations to its target database, builds for that environment, and deploys the combined Worker. See [`docs/environments.md`](docs/environments.md) for the isolation matrix and release checks.

## Workspace

```text
apps/
  consultation/   TanStack Start UI, voting domain, and Cloudflare Worker
packages/
  database/       SQLite schema and versioned D1 migrations
  shared/         Radix Gateway and governance services
```
