# Consultation

Radix governance consultation dApp and vote collector, deployed together as one Cloudflare Worker.

## Architecture

- TanStack Start serves the React dApp from the Worker.
- `GET /vote-results` and `GET /account-votes` are same-origin Worker routes.
- the Worker's scheduled handler polls the Radix Gateway every five minutes in production.
- Cloudflare D1 stores the cursor, lease, exact vote totals, and account votes.
- production and preview use separate Workers, D1 databases, Radix networks, variables, and schedules.

The vote collector remains a separate workspace package for domain boundaries, but it has no independent runtime or deployment.

## Local development

```sh
pnpm install
pnpm --filter consultation-dapp d1:migrate:local
pnpm --filter consultation-dapp dev
```

The app and both vote APIs are available on `http://localhost:3000`.

## Verification

```sh
pnpm check-types
pnpm --filter vote-collector test run
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
  consultation/   TanStack Start UI and Cloudflare Worker entry point
  vote-collector/ Effect vote-domain module bundled into consultation
packages/
  database/       SQLite schema and versioned D1 migrations
  shared/         Radix Gateway and governance services
```
