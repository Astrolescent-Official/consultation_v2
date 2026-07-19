# Vote collector

The vote collector is an Effect-based domain module bundled into the consultation Cloudflare Worker. It is not deployed separately.

The combined Worker provides:

- `GET /vote-results`
- `GET /account-votes`
- a five-minute production scheduled poll
- a ten-minute preview scheduled poll
- exact vote persistence in the environment's D1 database

Runtime bindings and schedules live in `../consultation/wrangler.jsonc`. The versioned SQLite migrations live in `../../packages/database/d1`.

## Correctness boundaries

- Vote power is stored as canonical decimal text; arithmetic uses `BigNumber`.
- Account-vote ordering uses a fixed-width lexical sort key, avoiding SQLite numeric coercion.
- A permanent lease row uses compare-and-set acquisition and ownership-guarded D1 batches.
- Revote removal, replacement votes, aggregate totals, and `last_vote_count` commit atomically.
- The poll cursor only advances after every calculation in the ledger page succeeds.

## Commands

Run from the repository root:

```bash
pnpm --filter vote-collector check-types
pnpm --filter vote-collector test run
pnpm --filter consultation-dapp test:worker
```

Deploy through the combined Worker:

```bash
pnpm deploy:preview
pnpm deploy:production
```
