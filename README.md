# Consultation

Radix governance consultation dApp running entirely on Cloudflare Workers and D1.

## Architecture

- TanStack Start serves the React dApp from the Worker.
- `GET /vote-results`, `GET /account-votes`, and
  `GET /majority-judgment-election` are same-origin Worker routes.
- the Worker's scheduled handler polls the Radix Gateway every five minutes in production.
- Cloudflare D1 stores the cursor, lease, exact vote totals, and account votes.
- production and preview use separate Workers, D1 databases, Radix networks, variables, and schedules.

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
pnpm check-types
pnpm --filter consultation-dapp test
pnpm --filter consultation-dapp test:worker
pnpm --filter consultation-dapp build
```

The Worker test suite runs against local workerd and D1. It covers exact decimal persistence, revotes, atomic rollback, numeric ordering, and poll-lease ownership.

## Deployment

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
