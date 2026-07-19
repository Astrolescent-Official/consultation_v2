# Goal: Consolidate Consultation and Vote Collector on Cloudflare

**Status:** Awaiting explicit implementation approval

**Estimated effort:** 7–11 engineering days, followed by a 2–7 day production soak

## Goal

Replace the AWS vote-collector deployment and PostgreSQL database with one
Cloudflare Worker application per environment. The Worker will serve the
consultation dApp, expose the vote-result APIs, run the scheduled ledger poll,
and persist vote state in Cloudflare D1.

Implementation must not begin until the user explicitly approves execution of
this goal.

## Confirmed Decisions

- Combine the consultation frontend/server and vote collector in one Worker
  codebase and deployment unit per environment.
- Use Cloudflare D1 instead of PostgreSQL.
- Do not migrate PostgreSQL data because the dApp has no active users.
- Create a fresh D1 schema and fresh production/test databases.
- Keep production and test isolated with separate Worker environments, D1
  databases, Radix networks, variables, and Cron Triggers.

## Important Distinction

"No migrations" means no PostgreSQL-to-D1 data transfer. D1 still requires
versioned SQLite schema files so new environments can be created consistently
and future schema changes remain safe.

The initial ledger cursor is a separate bootstrap decision:

- Default: initialize from the current ledger state and collect new votes only.
- If existing on-ledger proposals need historical results, replay from the
  governance component deployment state version into the empty D1 database.
- Do not copy historical rows from PostgreSQL in either case.

## Target Architecture

```text
Browser
  -> Consultation Worker.fetch
       -> /.well-known/radix.json
       -> vote result APIs
       -> TanStack Start SSR/static assets
       -> D1

Cloudflare Cron Trigger
  -> Consultation Worker.scheduled
       -> Radix Gateway
       -> vote calculation
       -> D1
```

The public API remains response-compatible with the current
`GET /vote-results` and `GET /account-votes` endpoints. The frontend will use
same-origin URLs, removing API Gateway, CORS, and
`VITE_VOTE_COLLECTOR_URL`.

## Non-Goals

- Migrating, transforming, or retaining PostgreSQL rows.
- Dual-writing to PostgreSQL and D1.
- Keeping the Docker/nginx deployment path as a production target.
- Running production and Stokenet polling against the same D1 database.
- Splitting the frontend and collector into separate Workers unless a measured
  platform limit makes the single-Worker target infeasible.

## Execution Plan

### Phase 1: Prove Worker Fit — 1–2 days

- [ ] Bundle the server-side vote collector with the existing consultation
  Worker and record compressed bundle size and startup time.
- [ ] Run the mainnet snapshot fixture in `workerd` and record CPU time, wall
  time, memory use, query count, and outbound concurrency.
- [ ] Prototype `@effect/sql-d1` with `@effect/sql-drizzle/Sqlite` and a real D1
  binding.
- [ ] Test an exact revote update using an atomic D1 batch.
- [ ] Record the governance deployment/current state versions and choose
  current-state bootstrap or ledger replay.

#### Phase 1 exit criteria

- Compressed Worker bundle is below 8 MB, leaving headroom under the paid-plan
  limit.
- Representative polling stays below 20 seconds p95 CPU and 2 minutes wall
  time.
- Combined external and D1 concurrency never exceeds five active operations.
- Exact decimal values round-trip without JavaScript number conversion.
- The single-Worker design is confirmed before full implementation continues.

### Phase 2: Build the D1 Persistence Layer — 2–3 days

- [ ] Replace the Postgres Drizzle schema with a SQLite schema and generate the
  initial D1 schema file.
- [ ] Store canonical vote power as `TEXT` and add a fixed-width sortable key
  for numeric ordering.
- [ ] Replace `PgClient`, Postgres migrations, and `@effect/sql-drizzle/Pg`
  with D1 and SQLite Effect layers.
- [ ] Move aggregate addition/subtraction to `BigNumber` and commit account
  votes, totals, and `lastVoteCount` atomically.
- [ ] Chunk address filters and multi-row writes to stay below D1's bound
  parameter and batch limits.

### Phase 3: Consolidate Fetch and Scheduled Handling — 1–2 days

- [ ] Add vote-result routing to the consultation Worker's `fetch()` handler
  before the TanStack Start fallback.
- [ ] Add `scheduled()` and configure a five-minute UTC Cron Trigger.
- [ ] Inject D1 and environment configuration into Effect layers without
  request-scoped module-global state.
- [ ] Change the browser vote client to same-origin API paths and remove the
  API Gateway URL configuration.
- [ ] Remove AWS Lambda handler types, SST configuration, `pg`, Node server,
  and runtime-only Node database dependencies after replacement tests pass.

### Phase 4: Make Polling Safe and Bounded — 1–2 days

- [ ] Retain ledger-page cursor checkpoints and stop cleanly before the Worker
  execution budget is exhausted.
- [ ] Replace the timestamp-only poll lock with an owner-token lease,
  conditional release, and renewal between pages.
- [ ] Serialize D1 commits while allowing bounded Radix Gateway fetching.
- [ ] Add retry with jitter for transient Gateway, rate-limit, and D1 overload
  failures.
- [ ] Emit structured logs for poll ID, cursor range, entities processed,
  duration, retry count, and failure cause.

### Phase 5: Verify, Deploy, and Retire AWS — 2–3 days plus soak

- [ ] Add Cloudflare Vitest tests with isolated local D1 storage and applied
  schema files.
- [ ] Run type checks, vote calculation tests, Worker API tests, scheduled
  handler tests, the mainnet snapshot fixture, and a Wrangler dry-run build.
- [ ] Create isolated test and production D1 databases and Worker environment
  bindings; branch previews must not receive Cron Triggers.
- [ ] Deploy test first, then production with a fresh D1 database and the
  approved ledger bootstrap position.
- [ ] Observe production for 2–7 days, test rollback once, and only then remove
  AWS/SST and PostgreSQL deployment documentation and resources.

## Fresh-Database Rollout

1. Create the D1 database and apply the initial schema.
2. Deploy the Worker with polling disabled and smoke-test the UI and empty API.
3. Set the approved ledger cursor and enable the Cron Trigger.
4. Verify cursor advancement and vote results against the independent tally
   script.
5. Remove the frontend's API Gateway dependency, then begin the soak period.

## Rollback

During the soak period, retain the current AWS deployment and PostgreSQL
database unchanged. If the Cloudflare deployment fails, restore the previous
Worker version and its API Gateway URL. Because there are no active users and no
PostgreSQL data is being migrated, rollback does not require reverse data
synchronization.

After AWS/PostgreSQL are retired, rollback means deploying the previous Worker
version and restoring D1 with Time Travel if storage state is involved.

## Required Verification

- Existing vote-result and account-vote response schemas remain unchanged.
- Revotes update account rows and aggregate totals exactly once.
- Vote power retains full decimal precision and sorts numerically.
- Failed D1 batches do not advance `lastVoteCount` or the ledger cursor.
- Overlapping scheduled invocations cannot both own the poll lease.

## Operational Acceptance Criteria

- One combined Worker serves the dApp, APIs, and scheduled poll in each
  environment.
- Production and test use separate D1 databases and Radix networks.
- The five-minute poll completes reliably within measured platform budgets.
- Structured Cloudflare logs make the last successful cursor and failures easy
  to identify.
- No AWS, SST, API Gateway, PostgreSQL, or external vote-collector URL is
  required by the production application.

## Approval Gate

Before approval, only read-only investigation and edits to this goal document
are allowed. Do not install dependencies, create Cloudflare resources, change
application code, migrate schemas, deploy, disable AWS, or delete anything.

Execution begins only after an explicit instruction such as:

> Approve and execute the Cloudflare Worker/D1 consolidation goal.
