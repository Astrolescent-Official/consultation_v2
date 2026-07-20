# Goal: Consolidate Consultation and Vote Collector on Cloudflare

**Status:** In progress — production and preview deployed; soak/retirement pending

**Estimated effort:** 7–11 engineering days, followed by a 2–7 day production soak

## Goal

Replace the AWS vote-collector deployment and PostgreSQL database with one
Cloudflare Worker application per environment. The Worker will serve the
consultation dApp, expose the vote-result APIs, run the scheduled ledger poll,
and persist vote state in Cloudflare D1.

Execution was explicitly approved on 2026-07-19. Production and Stokenet
preview are now running on the consolidated Worker and D1 architecture. The
remaining release work is the production soak/rollback check and final
resolution of the externally supplied PostgreSQL resource.

## Confirmed Decisions

- Combine the consultation frontend/server and vote collector in one Worker
  codebase and deployment unit per environment.
- Use Cloudflare D1 instead of PostgreSQL.
- Do not migrate PostgreSQL data because the dApp has no active users.
- Create a fresh D1 schema and fresh production/test databases.
- Keep production and test isolated with separate Worker environments, D1
  databases, Radix networks, variables, and Cron Triggers.

## Execution Record — 2026-07-19

- Production Worker: `consultation` at
  `https://consultation.radixdao.workers.dev`, version
  `5a873299-17fd-4344-87d9-11c558813ea3`.
- Production D1: `consultation-votes-production`
  (`2cbaf581-17c9-4543-a5e9-c0825b5c9d8b`).
- Preview Worker: `consultation-preview` at
  `https://consultation-preview.radixdao.workers.dev`, version
  `25ccac66-b9ef-4bcc-9352-f30e7daf2969`.
- Preview D1: `consultation-votes-preview`
  (`ce7e92ad-d08f-440a-a22b-5e151bbc719a`). The initial schema migration is
  applied and verified. The Worker uses Stokenet network `2`, the supplied
  dApp-definition address, and an isolated ten-minute Cron Trigger.
- The first preview cron completed at the 2026-07-20 08:30 UTC trigger,
  bootstrapped the D1 cursor to Stokenet state version `378197140`, and released
  its lease (`owner = ''`, `expires_at = 0`).
- Final upload was 3.77 MiB total / 780.46 KiB gzip, with a 47 ms Worker
  startup time.
- The representative mainnet snapshot passed inside `workerd` in 2.896 seconds
  and produced the exact expected total. The harness does not expose a separate
  peak-memory counter; D1 statement and Gateway concurrency are bounded in
  code instead of inferred from process-wide test metrics.
- The first production cron completed successfully in 3.118 seconds wall time
  and 76 ms CPU time, advanced the fresh D1 cursor to state version
  `538489821`, released its lease, and reported no exceptions.
- A 2026-07-20 08:30 UTC production health checkpoint still showed cursor
  `538489821` with the poll lease cleanly released.
- Production smoke checks passed for the app shell, Radix manifest,
  `/vote-results`, and `/account-votes`.
- AWS CLI 2.36.2 is installed. AWS login was approved on 2026-07-20 and verified
  as account `773802563598`. Read-only inventory in the configured `eu-west-1`
  region found no Lambda functions, API Gateway v2 APIs, EventBridge rules,
  CloudWatch log groups, SST state S3 bucket, or matching vote-collector IAM
  roles. There is therefore no deployed SST stage to remove in that account.
- PostgreSQL was externally supplied and cannot be identified from this
  workspace: no connection value is present in the current files or shell.
- Blocker audit on 2026-07-19 confirmed that no prior `consultation-preview`
  Worker exists from which to recover a Stokenet identity, the production soak
  window has not elapsed, and the production API remains healthy.

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

### Phase 1: Prove Worker Fit — complete

- [x] Bundle the server-side vote collector with the existing consultation
  Worker and record compressed bundle size and startup time.
- [x] Run the mainnet snapshot fixture in `workerd` and record the runtime
  telemetry exposed by the harness and production cron. Peak memory and a raw
  query counter are not exposed, so statement sizes and concurrency are
  explicitly bounded and covered by integration tests.
- [x] Prototype `@effect/sql-d1` with `@effect/sql-drizzle/Sqlite` and a real D1
  binding. The prototype confirmed that the adapter does not support D1
  transactions, so the implementation uses native atomic `D1Database.batch()`.
- [x] Test an exact revote update using an atomic D1 batch.
- [x] Record the governance deployment/current state versions and choose
  current-state bootstrap or ledger replay.

#### Phase 1 exit criteria

- Compressed Worker bundle is below 8 MB, leaving headroom under the paid-plan
  limit.
- Representative polling stays below 20 seconds p95 CPU and 2 minutes wall
  time.
- Combined external and D1 concurrency never exceeds five active operations.
- Exact decimal values round-trip without JavaScript number conversion.
- The single-Worker design is confirmed before full implementation continues.

### Phase 2: Build the D1 Persistence Layer — complete

- [x] Replace the Postgres Drizzle schema with a SQLite schema and generate the
  initial D1 schema file.
- [x] Store canonical vote power as `TEXT` and add a fixed-width sortable key
  for numeric ordering.
- [x] Replace `PgClient`, Postgres migrations, and `@effect/sql-drizzle/Pg`
  with D1 and SQLite Effect layers.
- [x] Move aggregate addition/subtraction to `BigNumber` and commit account
  votes, totals, and `lastVoteCount` atomically.
- [x] Chunk address filters and multi-row writes to stay below D1's bound
  parameter and batch limits.

### Phase 3: Consolidate Fetch and Scheduled Handling — complete

- [x] Add vote-result routing to the consultation Worker's `fetch()` handler
  before the TanStack Start fallback.
- [x] Add `scheduled()` and configure a five-minute UTC Cron Trigger.
- [x] Inject D1 and environment configuration into Effect layers without
  request-scoped module-global state.
- [x] Change the browser vote client to same-origin API paths and remove the
  API Gateway URL configuration.
- [x] Remove AWS Lambda handler types, SST configuration, `pg`, Node server,
  and runtime-only Node database dependencies after replacement tests pass.

### Phase 4: Make Polling Safe and Bounded — complete

- [x] Retain ledger-page cursor checkpoints and stop cleanly before the Worker
  execution budget is exhausted.
- [x] Replace the timestamp-only poll lock with an owner-token lease,
  conditional release, and renewal between pages.
- [x] Serialize D1 commits while allowing bounded Radix Gateway fetching.
- [x] Add retry with jitter for transient Gateway, rate-limit, and D1 overload
  failures.
- [x] Emit structured logs for poll ID, cursor range, entities processed,
  duration, retry count, and failure cause.

### Phase 5: Verify, Deploy, and Retire AWS — in progress

- [x] Add Cloudflare Vitest tests with isolated local D1 storage and applied
  schema files.
- [x] Run type checks, vote calculation tests, Worker API tests, scheduled
  handler tests, the mainnet snapshot fixture, and a Wrangler dry-run build.
- [x] Create isolated preview and production D1 databases, apply their initial
  schema, and configure Worker bindings. Preview versions do not receive a Cron
  Trigger until that environment is explicitly deployed.
- [x] Deploy preview with its Stokenet dApp-definition address and verify its
  app shell, Radix manifest, and both same-origin vote APIs.
- [x] Deploy production with a fresh D1 database and current-state bootstrap.
- [ ] Observe production for 2–7 days, test rollback once, and then resolve the
  externally supplied PostgreSQL resource. The approved AWS account has no SST
  resources to remove. Obsolete AWS/SST/PostgreSQL application code and
  documentation have already been removed from this repo.

## Retained AWS/PostgreSQL Retirement Inventory

The last SST definition is preserved at commit `5254c22`. It identifies app
`vote-collector` in `eu-west-1` with possible `test`, `stokenet`, and
`production` stages. Read-only AWS inventory on 2026-07-20 found no SST state
bucket or generated runtime resources in approved account `773802563598`.
Script names alone are not proof that a stage was ever deployed, so no AWS
deletion is required based on the available account evidence.

For every deployed stage, the SST resource graph contains:

- one scheduled poll Lambda plus its EventBridge schedule, IAM role and
  permissions, and CloudWatch log group;
- two HTTP API Lambdas plus their IAM roles, invoke permissions, and CloudWatch
  log groups;
- one API Gateway v2 API with stage, routes, and Lambda integrations.

PostgreSQL was supplied through `DATABASE_URL`; SST did not provision or own
that database. Its provider and exact instance must therefore be identified and
removed separately after the rollback window.

Retirement procedure after the production soak:

1. Preserve the 2026-07-20 read-only inventory as evidence that the approved
   AWS account has no deployed SST resources to remove.
2. If a different AWS account is later identified, verify its identity, inspect
   SST state, and export each discovered stage before changing resources.
3. Only for a verified deployed stage, use the SST definition from commit
   `5254c22` in a retirement-only working tree and review removal before running
   `sst remove --stage <stage>`.
4. Do not delete account-level SST state/bootstrap S3, ECR, AppSync, or
   `/sst/bootstrap` resources unless a separate account-wide audit proves that
   no other SST app uses them.
5. Remove the external PostgreSQL instance only after identifying its owner and
   confirming the Cloudflare rollback check no longer depends on it.

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

## Approval Gate — passed 2026-07-19

Before approval, only read-only investigation and edits to this goal document
are allowed. Do not install dependencies, create Cloudflare resources, change
application code, migrate schemas, deploy, disable AWS, or delete anything.

Execution began after the explicit instruction:

> Approve and execute the Cloudflare Worker/D1 consolidation goal.
