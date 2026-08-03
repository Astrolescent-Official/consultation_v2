# Operator-Triggered Majority Judgment Scheduling — Implementation Plan

**Status:** plan — reviewed and ready for implementation
**Date:** 2026-08-02
**Requirements source:** client change request *"Operator-Triggered Majority Judgment
Scheduling"* (status: requirements — approved for implementation)
**Supersedes:** the four-date scheduling model introduced by CR-002
**Related:** [`2026-08-01-majority-judgment-post-cr-remediation.md`](./2026-08-01-majority-judgment-post-cr-remediation.md)
(authoritative), [`2026-07-21-majority-judgment-elections-design.md`](./2026-07-21-majority-judgment-elections-design.md) (superseded)

This plan turns the requirements into an ordered, reviewable work breakdown. It
uses the requirements' own identifiers (`SC-*`, `EV-*`, `SH-*`, `IX-*`, `UI-*`,
`PV-*`) so a reviewer can map every task back to its requirement, and adds the
edits the requirements do not name (§3) plus the anchors that shifted (§2).

---

## 1. Summary of the change

MJ elections stop carrying author-supplied calendar dates. Creation takes no
instants; the candidate-list TC opens at the transaction clock. Round 1 grading
opens only when a Governance Operator calls a new owner-gated method, after the
TC deadline has elapsed and a passed outcome is recorded on-ledger. The Round 2
rerun becomes now-based on the same shared path. `round_one` becomes
`Option<MajorityJudgmentRound>`, so an unopened round is an absent DB row and
does not require a nullable round column or data backfill. This implementation
does add the D1 status index used by the new finalizer query as migration
`0006`; deployment may wipe and rebuild D1 because there are no production
users or in-flight elections to preserve.

Atomic TC+election creation, the immutable candidate list, the candidate-order
shuffle, and the single creation-time voting-power snapshot are all preserved.

---

## 2. Requirements verified against HEAD (`2c7da00`)

Every file/line anchor in the requirements document was checked. All of them
resolve to the code they claim. Notable confirmations:

| Requirement anchor | Verified at HEAD |
|---|---|
| `governance.rs:737-859` four-`Instant` creation | `make_majority_judgment_election` starts at `scrypto/src/governance.rs:736`; the four assert blocks are at `:750-786` |
| `governance.rs:605-620` clock-derived TC | `make_temperature_check` derives `now` / `now + tc.voting_days` at `:604-611` |
| `governance.rs:1116-1119` rerun deadline gate | `assert!(now >= election.round_one.deadline, "Round 1 has not ended")` |
| `governance.rs:1002-1022` `passed_temperature_check_for_election` | asserts *outcome recorded* **and** *passed* in one call |
| `lib.rs:349` `round_one: MajorityJudgmentRound` | non-optional; `rerun` at `:350` already `Option` |
| `repo.ts:136-144` `hasPassedTemperatureCheckGate` | includes `MJ_PENDING` |
| `repo.ts:149-163` `isPhaseTransitionBlocked` | as quoted |
| `repo.ts:482-501` `getActiveElectionRounds` | `innerJoin(mjRound, …)` + `notInArray` |
| `repo.ts:729-742` hard-fail | `MajorityJudgmentRoundNotFoundError` when the active round row is missing |
| `projection.ts:26-28` outcome collapse | `deriveProjectedTemperatureCheckOutcome` returns `'PENDING'` for a recorded pass |
| `schemas.ts:256`, `governance/schemas.ts:945/974-1030` | `round_one` mandatory in both decode surfaces; `ScryptoOptionalRoundSchema` exists and is used for `rerun` |
| `majorityJudgment.ts:268-306 / 308-314 / 440` | input schemas + `currentRound` |
| `TemperatureCheckForm.tsx:554-599 / 265-283 / 160-163`, `schema.ts:114-117 / 186-205`, `formOptions.ts:54-100` | as quoted |
| `MajorityJudgmentElectionView.tsx:255-264`, `ElectionsList.tsx:29-39`, `ElectionStagesCard.tsx:112-114 / 121-123` | as quoted |
| `adminAtom.ts:190-224` | `startMajorityJudgmentRerunAtom` begins at `:188`; its collector pre-flight check is present |
| IX-12 round absence | `mj_round` (`packages/database/src/schema.ts:191-225`) has no nullable-window column to change or backfill; the chosen status index is a normal D1 schema migration after `0005_deep_black_tom.sql` |
| IX-11 `setPhaseStatus` no-op claim | confirmed: `repo.ts:428-478` writes `mj_election.status` and separately UPDATEs `mj_round`; the round UPDATE matches zero rows when absent |

Call-site counts for the Scrypto test rewrite (Phase 1): `create_election` is
called **15** times and `start_rerun` **7** times in
`scrypto/tests/majority_judgment.rs`, plus the one inline creation manifest at
`:929-944`.

---

## 3. Verified gaps and resolved implementation decisions

These are required edits or implementation details not fully enumerated by the
requirements. The decisions that were open during review are resolved here so
implementation does not need to infer product or deployment policy.

### G1 — `majorityJudgmentVoterEntriesAtom` reads `roundOne` (mandatory)

`apps/consultation/src/atom/majorityJudgmentAtom.ts:91`:

```ts
const round = Option.getOrElse(election.rerun, () => election.roundOne)
```

This resolves the voters KVS address for "your votes" display. Once SH-4 makes
`roundOne` an `Option`, this stops type-checking. It must return an empty entry
list when neither round exists. Not covered by UI-1…UI-12.

### G2 — the owner-controls early return hides the new button (mandatory)

`MajorityJudgmentOwnerControls.tsx:60`:

```ts
if (!canRerun && !canResolveTie) return null
```

UI-6 adds an "Open Round 1 grading" button but does not amend this guard. In
`MJ_PENDING` both existing capabilities are false, so the card — and therefore
the new button — never renders. The guard must become
`if (!canOpenRoundOne && !canRerun && !canResolveTie) return null`.

### G3 — all `currentRound` consumers must handle `null` (mandatory)

`apps/consultation/src/routes/election/$id/-$id/index.tsx` dereferences
`currentRound` while submitting a ballot (`:149`), building view props
(`:238-243`), passing the owner-control round (`:335`), and recording a tie
resolution (`:346`). Every site must narrow `currentRound !== null` first.
Ballot submission and tie resolution return without dispatch when no round
exists. View window/grade props use `undefined` after narrowing, while the API
contract itself remains the explicit `currentRound: null` required by IX-8.

`MajorityJudgmentElectionView.quorumXrd` (`:68`) also becomes optional and
the turnout badge renders only when it exists. The owner-controls `round` prop
becomes optional because it is used only by tie-resolution copy, which is
unreachable while Round 1 is unopened. The new opener atom's waiting state must
also be included in the page's combined `busy` prop.

### G4 — show TC tallies during the operator wait (resolved)

`ElectionTemperatureCheckStage.tsx:110`:

```ts
const showTallies = status !== 'PENDING' && status !== 'MJ_PENDING'
```

Under the old model `MJ_PENDING` was a short, scheduled window, so suppressing
tallies there was harmless. Under operator-triggered opening the wait is
unbounded, and the public would be unable to see the candidate-list result that
justifies opening grading — for an arbitrarily long time. Change
`showTallies` so tallies are hidden only in `PENDING`; they are visible in
`MJ_PENDING`.

### G5 — the fourth `deriveMajorityJudgmentPhase` call stays in pass 2 (confirmed)

IX-9 says to move `finalizer.ts:166-246` into pass 1. There is a fourth call at
`finalizer.ts:310` inside the round loop's `!readyToFinalize` branch, with
`tcOutcome: 'PASSED'` hard-coded. It stays in pass 2 and still has a real round
row to read `votingStart`/`votingEnd` from, so it remains unchanged. The
extraction must not accidentally sweep it into the TC-only pass.

### G6 — `renderInstant` import becomes unused (mandatory)

Removing all five `renderInstant(...)` arguments (SH-3) leaves the import at
`packages/shared/src/governance/governanceComponent.ts:36` unused, which fails
lint. The function itself stays exported from `governanceManifests.ts` (used by
`governanceManifests.test.ts:79` and by the standard-path manifests); only the
import in `governanceComponent.ts` is removed.

### G7 — the `GovernanceAction` variant is also switched on in `poll.ts` (mandatory)

EV-2 renames the event. The `_tag: 'MajorityJudgmentRerunStarted'` variant is
declared at `governanceEvents.ts:57`, produced at `:260`, and consumed by the
dispatcher at `apps/consultation/src/server/voting/poll.ts:154`. All three move
together to `MajorityJudgmentRoundStarted`. Phase 3 covers the first two; the
requirements do not name `poll.ts`.

### G8 — fresh deployment and clean re-index (resolved)

D5 is adopted as release policy: deploy a new package/component address, wipe
and recreate D1 from migrations, and index only the new component. There are no
production users or in-flight elections to preserve, so this task deliberately
does **not** add versioned SBOR decoders, legacy event support, row backfills, or
state carry-over. The unrelated uncommitted Stokenet address edit in the primary
checkout is not part of the task branch; implementation records the actual new
addresses only after deployment.

### G9 — pass 2 must query after pass 1 (mandatory)

`finalizer.ts:140` currently loads `getActiveElectionRounds()` before any
processing. Merely invoking `resolveTemperatureCheckGate(now)` before the
round `forEach` would leave pass 2 holding stale election statuses and would
not guarantee IX-10's same-drain `MJ_PENDING → LIVE` promotion. The required
order is:

1. run `resolveTemperatureCheckGate(now)`,
2. query `getActiveElectionRounds()` after all pass-1 writes complete,
3. group those fresh rows and run the round pass.

This order also keeps a pass-1 `TC_FAILED` row out of pass 2.

### G10 — confirmation deadlines use the frozen parameter snapshot (mandatory)

The election API does not currently expose `votingDays` or
`rerunVotingDays`, and the current parameter registry may have changed since
creation. Add an admin-facing
`majorityJudgmentRoundDurationsAtom(electionId)` in
`majorityJudgmentAtom.ts`: read the election from the component, follow its
`temperatureCheckId`, and read both durations from
`temperatureCheck.parameterSet.parameters.election`, which is the immutable
creation-time snapshot.

The confirmation displays the frozen duration and an estimated closing time
computed from the browser clock. It must say the exact deadline is set from
ledger time when the transaction commits; that exact value cannot be known
before signing. After commit, the existing election refresh displays the
on-ledger round deadline. No D1 duration columns are needed.

---

## 4. Working agreement

Per [`AGENTS.md`](../../AGENTS.md), the complete change request is one
implementation task in one linked worktree and one `codex/*` branch, never in
the primary checkout or on `main`.

```bash
pnpm worktree:codex mj-operator-triggered-scheduling
```

The phases below are ordered commits/checkpoints on that branch, not separate
branches. Phase 2 changes shared event exports that Phase 3 consumes, so Phases
2–3 form one atomic TypeScript verification checkpoint; the repository is not
expected to type-check between those two internal steps. The task is complete
only when `pnpm verify` is green and all changes are committed. Scrypto is
verified with `scrypto test && scrypto build`, never `cargo test`; the final
handoff states the commit SHA and verification results.

**Deployment coupling:** Phases 1–3 must ship as one release. The new collector
is switched directly to the fresh component and never indexes the superseded
package's event shapes.

---

## 5. Phase 0 — indexer refactor and TC-gate correction

Covers **IX-3, IX-4, IX-9** (the parts that are pure refactor), plus the
`PV-9`/`PV-10` transition rules. Doing this first makes the deadlock fix
reviewable in isolation from the contract change.

### 5.1 `projection.ts` — extract the TC-phase derivation

Split `deriveMajorityJudgmentPhase` (`:30-46`) into two functions:

```ts
export const deriveMajorityJudgmentTemperatureCheckPhase = (
  now: Date,
  boundaries: {
    readonly tcVotingStart: Date
    readonly tcVotingEnd: Date
    readonly tcOutcome: 'PENDING' | 'PASSED' | 'FAILED'
  }
): 'TC_FAILED' | 'PENDING' | 'TC_LIVE' | 'MJ_PENDING' => {
  if (boundaries.tcOutcome === 'FAILED') return 'TC_FAILED'
  if (boundaries.tcOutcome === 'PENDING') {
    return now < boundaries.tcVotingStart ? 'PENDING' : 'TC_LIVE'
  }
  return 'MJ_PENDING'
}
```

`deriveMajorityJudgmentPhase` keeps its existing signature and delegates,
adding the `votingStart`/`votingEnd` branches **only** when the delegate returns
`MJ_PENDING`. Every existing call site (`finalizer.ts:181`, `:236`, `:310`,
`majorityJudgmentCollector.test.ts`) keeps working unchanged.

### 5.2 `repo.ts` — move `MJ_PENDING` off the TC gate (IX-3 + IX-4)

Rename `hasPassedTemperatureCheckGate` → `isPastTemperatureCheckGate` and drop
`MJ_PENDING` from it, leaving `LIVE`, `ROUND_1_FAILED`, `RERUN_PENDING`,
`RERUN_LIVE`, `TIE_UNRESOLVED`, `FINAL`, `FAILED`.

Add the compensating clause to `isPhaseTransitionBlocked` (`:149-163`):

```ts
|| (currentStatus === 'MJ_PENDING' &&
    (nextStatus === 'PENDING' || nextStatus === 'TC_LIVE'))
```

**These two edits are one atomic change.** IX-3 alone reintroduces the
`MJ_PENDING → TC_LIVE` flicker, because `deriveProjectedTemperatureCheckOutcome`
(`projection.ts:26-28`) collapses a recorded `PASSED` back to `'PENDING'`, so
every re-sync of an `MJ_PENDING` election derives `TC_LIVE`.

Net transitions from `MJ_PENDING` (IX-5): → `TC_FAILED` allowed (PV-9), → `LIVE`
allowed, → `PENDING` and → `TC_LIVE` blocked (PV-10).

### 5.3 `repo.ts` — add the join-free query (IX-9)

```ts
const getElectionsAwaitingTemperatureCheckGate = Effect.fn(
  'MajorityJudgmentRepo.getElectionsAwaitingTemperatureCheckGate'
)(function* () {
  return yield* db
    .select()
    .from(mjElection)
    .where(inArray(mjElection.status, ['PENDING', 'TC_LIVE', 'MJ_PENDING']))
    .orderBy(asc(mjElection.id))
})
```

Export it alongside the existing repo methods. `getActiveElectionRounds` keeps
its INNER JOIN and `notInArray` filter **unchanged** (IX-10) — the deliberate
choice against LEFT JOIN, which would push `?.` through the hottest correctness
code in the repo and make the `rounds.sort` meaningless.

### 5.4 `finalizer.ts` — two-pass finalize (IX-7 / IX-9 / PV-13)

Move the TC-gate block currently at `:166-246` verbatim into a new
`resolveTemperatureCheckGate(now)` pass driven by
`getElectionsAwaitingTemperatureCheckGate()`. In `finalize`, invoke this
pass **before calling `getActiveElectionRounds()`**, then query and group the
fresh round rows before starting pass 2 (**G9**). Running pass 1 only before the
round `forEach` is insufficient because the already-loaded rows would contain
stale statuses. The verbatim carry-over must include:

- the `now < election.tcVotingEnd` early phase write,
- the `UNPROJECTED_TC_QUORUM_XRD` deferral,
- the `tcVerdict.cacheAvailable` deferral,
- `deriveAuthoritativeTemperatureCheckOutcome`, and the `FAILED` / `PENDING`
  branches.

Because pass 1 has no round row, its phase writes call
`deriveMajorityJudgmentTemperatureCheckPhase` (§5.1) and
`setPhaseStatus(electionId, 1, status)` — which is a harmless no-op on the
`mj_round` UPDATE while still writing `mj_election.status` (IX-11, verified at
`repo.ts:428-478`).

Replace the round loop's gate block with an early skip when `election.status` is
`'PENDING'` or `'TC_LIVE'`. `MJ_PENDING` **falls through**, because pass 2 is
what promotes it to `LIVE` once a round row exists (IX-10).

The final shape is deliberately ordered:

```ts
yield* resolveTemperatureCheckGate(now)
const projected = yield* repo.getActiveElectionRounds()
// group the fresh rows, then run the existing round pass
```

### 5.5 Phase 0 gate

`pnpm verify`. Existing collector and workerd/D1 suites are unchanged except for
new cases:

- `MJ_PENDING → TC_FAILED` is now allowed (PV-9),
- `MJ_PENDING → TC_LIVE` is still blocked (IX-4/PV-10),
- an election in `PENDING`/`TC_LIVE`/`MJ_PENDING` is returned by
  `getElectionsAwaitingTemperatureCheckGate` and its verdict is published even
  with no round row (PV-13) — this test is written now and is the one that will
  fail loudly if Phase 1 regresses it,
- when pass 1 promotes a `TC_LIVE` election that already has a newly projected
  Round 1 row to `MJ_PENDING`, pass 2 observes the fresh status and promotes it
  to `LIVE` in the same `finalize` call (IX-10/G9),
- when pass 1 changes an election to `TC_FAILED`, pass 2 does not process its
  round row.

---

## 6. Phase 1 — Scrypto contract

Covers **SC-1 … SC-13, EV-1, EV-2**. Gate: `cd scrypto && scrypto test && scrypto build`.

### 6.1 `lib.rs` — types and events

- `MajorityJudgmentElection.round_one` → `Option<MajorityJudgmentRound>` (`:349`, D1).
- `MajorityJudgmentElectionCreatedEvent`: drop `voting_start` and
  `voting_deadline` (`:440-450`, EV-1). The TC window is already published by
  `TemperatureCheckCreatedEvent`.
- Delete `MajorityJudgmentRerunStartedEvent` (`:462-470`); add:

```rust
#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct MajorityJudgmentRoundStartedEvent {
    pub election_id: u64,
    pub round: MajorityJudgmentRoundId,
    pub snapshot: Instant,
    pub start: Instant,
    pub deadline: Instant,
    pub quorum: Decimal,
    pub minimum_median_grade: Grade,
}
```

Update the event imports at `governance.rs:31-33`.

### 6.2 `make_majority_judgment_election` (SC-1 … SC-5)

New signature — four `Instant` parameters removed:

```rust
pub fn make_majority_judgment_election(
    &mut self,
    author: Global<Account>,
    draft: TemperatureCheckDraft,
    parameter_set_id: String,
    candidate_order: Vec<MajorityJudgmentCandidateId>,
) -> u64
```

- Delete the three assertion blocks: `temperature_check_start > now` (`:750-754`),
  the minimum TC deadline check (`:762-773`), and the voting-start ordering plus
  minimum voting deadline checks (`:774-786`) — **SC-3**.
- **Retain** the `GovernanceProcessParameters::MajorityJudgment` match at
  `:756-761` so a Standard parameter set is rejected at creation, not deferred
  to open time — **SC-4**.
- Derive the TC window with `Self::checked_add_governance_duration(now,
  parameter_set.parameters.temperature_check().voting_days, "Temperature check
  deadline")`, exactly as `:604-611` does — **SC-2**. `snapshot` stays `now`.
- `insert_temperature_check(..., snapshot, now, deadline, Some(continuation))`.
- Election is inserted with `round_one: None` — **SC-5**. The panic at `:597-601`
  guarding atomic creation stays (PV-8).

### 6.3 The shared opener (SC-6 … SC-12)

Register in `enable_method_auth!` (`governance.rs:44-64`), beside the existing
owner-gated methods — **SC-6**, declarative only, no body-level
`assert_access_rule`:

```rust
start_majority_judgment_round_one => restrict_to: [owner];
```

Two private helpers keep both openers on one path (**SC-12**), splitting at the
KVS borrow boundary rather than trying to thread a closure through
`KeyValueEntryRefMut`:

```rust
/// Resolves the passed TC and returns (snapshot, tc_deadline, snapshotted params).
/// Params come from `temperature_check.parameter_set.parameters` — the version
/// frozen at creation — never `resolve_parameter_set` (SC-8, PV-6).
fn majority_judgment_round_context(
    &self,
    election_id: u64,
) -> (Instant, Instant, MajorityJudgmentParameters) {
    let (_, temperature_check) = self.passed_temperature_check_for_election(election_id);
    let parameters = match &temperature_check.parameter_set.parameters {
        GovernanceProcessParameters::MajorityJudgment { election, .. } => election.clone(),
        GovernanceProcessParameters::Standard { .. } => {
            panic!("Election does not contain Majority Judgment parameters")
        }
    };
    (temperature_check.snapshot, temperature_check.deadline, parameters)
}

/// Asserts the target slot is empty, builds the round, and emits one event.
fn open_majority_judgment_round(
    election: &mut MajorityJudgmentElection,
    election_id: u64,
    round_id: MajorityJudgmentRoundId,
    snapshot: Instant,
    start: Instant,
    deadline: Instant,
    quorum: Decimal,
    minimum_median_grade: Grade,
) { /* is_none() assert per slot, assign, Runtime::emit_event(MajorityJudgmentRoundStartedEvent { .. }) */ }
```

`start_majority_judgment_round_one(election_id: u64)` asserts, in order
(**SC-7**):

1. Owner authority — declarative, per SC-6.
2. Election exists, TC outcome recorded, TC passed — via
   `passed_temperature_check_for_election` inside the context helper; its assert
   covers both (PV-2).
3. `now >= temperature_check.deadline`, message `"Temperature check has not
   ended"`, mirroring `make_proposal:659-662` (PV-1).
4. Parameters are Majority Judgment — inside the context helper.
5. `election.round_one.is_none()`, message `"Round 1 has already opened"` (PV-4).
6. `deadline = Self::checked_add_governance_duration(now,
   parameters.voting_days, "Election voting deadline")`.

Then `Self::new_round(snapshot, now, deadline, parameters.quorum,
parameters.minimum_median_grade)` → `election.round_one` (**SC-9**). Snapshot is
the TC snapshot, never a fresh one (**D6**, PV-5). Grading opens on the
operator's transaction with no notice period (**D4**).

**Not asserted, deliberately (SC-10)** — worth stating in a code comment so it
survives review: `hidden` (a moderation flag; coupling it to a lifecycle
transition would make un-hiding a governance action), `rerun.is_none()` /
`tie_resolution.is_none()` (unreachable while `round_one.is_none()`), and the TC
`continuation` link (structurally 1:1).

**SC-11** — `start_majority_judgment_rerun(election_id: u64)` loses
`voting_start`. Round 2 opens at `now` with `deadline = now +
rerun_voting_days`. Its existing guards are retained (`now >=
round_one.deadline`, `rerun.is_none()`, `tie_resolution.is_none()`); the
`voting_start >= now` assert at `:1125-1128` is deleted. Both openers emit the
same `MajorityJudgmentRoundStartedEvent` (**D3**).

### 6.4 The three unwrap sites (SC-13, D2, PV-12)

No sentinel instants — a sentinel `Instant(0)` deadline passes the rerun and
tie-resolution guards and would let an operator open Round 2 on an election
whose Round 1 never opened.

| Site | Change |
|---|---|
| `governance.rs:1048` `MajorityJudgmentRoundId::RoundOne` in `vote_on_majority_judgment_election` | `election.round_one.as_mut().expect("Round 1 has not opened")` |
| `governance.rs:1117` rerun deadline gate | `election.round_one.as_ref().expect("Round 1 has not opened")` |
| `governance.rs:1179` tie-resolution deadline lookup | `election.round_one.as_ref().expect("Round 1 has not opened").deadline` |

### 6.5 `scrypto/tests/majority_judgment.rs`

- `create_election` helper (`:244-292`) drops its four `i64` window parameters
  and the four `Instant::new(..)` manifest args — **15 call sites** to update.
- The inline creation manifest at `:929-944` (the Standard-parameter-set
  rejection test) drops its four `Instant::new(..)` args.
- `start_rerun` helper (`:432-445`) drops `voting_start` — **7 call sites**.
- Existing assertions at `:643-645`, `:704`, and `:1237-1238` unwrap
  `round_one` with an explicit expectation after the test has opened it.
- Assert the emitted `MajorityJudgmentRoundStartedEvent` payload for both
  `RoundOne` and `Rerun`, including the round discriminant, snapshot, start,
  deadline, quorum, and minimum grade.
- New cases per §11.

---

## 7. Phase 2 — shared package

Covers **SH-1 … SH-6**, plus **G6**.

- **SH-1** `MakeMajorityJudgmentElectionInputSchema`
  (`majorityJudgment.ts:268-306`): drop `tcVotingStart`, `tcVotingEnd`,
  `votingStart`, `votingEnd` and the cross-field ordering `Schema.filter` at
  `:297-303`. The candidate-permutation filter stays.
- **SH-2** `StartMajorityJudgmentRerunInputSchema` (`:308-314`): drop
  `votingStart`.
- **SH-3** `governanceComponent.ts`: `makeMajorityJudgmentElectionManifest`
  (`:1249-1263`) drops its four `renderInstant` args; the rerun manifest
  (`:1326-1335`) drops its one; remove the now-unused `renderInstant` import at
  `:36` (**G6**). Add `startMajorityJudgmentRoundOneManifest` mirroring the
  rerun manifest, **including the admin badge proof**:

  ```
  ${adminBadgeProof}
  CALL_METHOD
    Address(${encodeManifestString(config.componentAddress)})
    "start_majority_judgment_round_one"
    ${parsedInput.electionId}u64
  ;
  ```

  with a `StartMajorityJudgmentRoundOneInputSchema` of `{ accountAddress,
  electionId }`, and export it from the component service record.
- **SH-4** decode surfaces: `packages/shared/src/schemas.ts:256` →
  `round_one: s.option(MajorityJudgmentRound)`; and
  `packages/shared/src/governance/schemas.ts:974-1030` → `round_one:
  ScryptoOptionalRoundSchema` (`:945`, already used for `rerun`), with
  `roundOne` becoming `Schema.OptionFromSelf(...)` and the decode/encode arms
  matching the existing `rerun` handling exactly.
- **SH-4 (events)** `schemas.ts:333-361`: drop `voting_start`/`voting_deadline`
  from `MajorityJudgmentElectionCreatedEvent`; replace
  `MajorityJudgmentRerunStartedEvent` with `MajorityJudgmentRoundStartedEvent`
  carrying `round: MajorityJudgmentRoundId`. **EV-3** — these are *not*
  decode-safe: the same `s.struct` shapes are used client-side in
  `adminAtom.ts:120-141` to learn a new election id, so both move together.
- **SH-5 / IX-8** `MajorityJudgmentElectionResponse.currentRound` (`:440`) →
  `Schema.NullOr(MajorityJudgmentRoundProjection)`. The property is always
  present in the serialized API response and is `null` before Round 1 opens;
  do not silently substitute an omitted property/`undefined`.
- **SH-6** add beside `canStartMajorityJudgmentRerun` (`:160-162`):

  ```ts
  export const canOpenMajorityJudgmentRoundOne = (
    status: MajorityJudgmentElectionStatus
  ) => status === 'MJ_PENDING'
  ```

**Status literals (IX-1, IX-2, IX-6).** No new literal. `MJ_PENDING`'s existing
copy — *"Candidate list approved — grading has not opened"* — already describes
the new meaning. **Keep** the `PENDING` and `RERUN_PENDING` literals in
`MajorityJudgmentElectionStatusSchema` and in `isTemperatureCheckPhase`;
removing them needlessly makes internal replay/test data brittle, and
`getElectionResponse:723-728` keys `activeRoundNumber` on
`RERUN_PENDING`. Keeping these literals is schema tolerance, not a commitment
to decode events or preserve elections from the superseded component. Only the
production *branch* in the phase derivation goes away.

Tests: `majorityJudgmentSbor.test.ts`, `majorityJudgment.test.ts`,
`governanceManifests.test.ts`.

---

## 8. Phase 3 — projection, events, API

Covers **IX-8, IX-11, EV-2's consumer side**, plus **G5** and **G7**.

- **IX-8 (the loud one)** `repo.ts:729-742`: make the local round lookup
  optional and serialize `currentRound: null` when no row exists. Guard the
  result lookup so it runs only when a current round exists. Without this,
  **every MJ election returns a 500 for its entire TC phase**.
  `MajorityJudgmentRoundNotFoundError` stays in use at `:347` (`getRound`)
  and `:517` (`commitCalculation`) — only the `getElectionResponse` path
  changes.
- **IX-11** `projection.ts`: `deriveElectionStatus` matches on the `roundOne`
  Option — with `rerun` absent *and* `roundOne` absent it delegates to
  `deriveMajorityJudgmentTemperatureCheckPhase` (§5.1) using only the TC
  boundaries; `makeRound` (`:144-159`) is only called when a round exists; and
  `repo.projectElection` takes `round` as optional. `setPhaseStatus(electionId,
  1, status)` needs no signature change.
- **EV-2 / G7** `governanceEvents.ts`: rename the `GovernanceAction` variant
  `MajorityJudgmentRerunStarted` → `MajorityJudgmentRoundStarted` (`:57`),
  replace the `case 'MajorityJudgmentRerunStartedEvent'` handler (`:255-266`)
  with `case 'MajorityJudgmentRoundStartedEvent'`, and update the dispatcher
  case in `apps/consultation/src/server/voting/poll.ts:154`. Per EV-3 the
  handler body stays trivially the same shape — it reads only `election_id` and
  re-projects live on-chain state at `state_version`.
- **G5** confirm the `deriveMajorityJudgmentPhase` call at `finalizer.ts:310`
  stays in pass 2 unchanged.

Tests: `majorityJudgmentCollector.test.ts`,
`majorityJudgmentDatabase.worker.test.ts`, `governanceEvents.test.ts`. Add
an explicit serialized-response assertion for `currentRound: null`, plus event
processor cases for both `RoundOne` and `Rerun` payloads.

**IX-12 / D1 decision.** Round absence itself changes no table shape and needs
no backfill. Add the status index used by the new pass-1 query as
`packages/database/d1/0006_mj_election_status_idx.sql`, with the matching
`index(...)` in `packages/database/src/schema.ts`. The deployed database may
be wiped and recreated from migrations before the fresh component is indexed;
there is no legacy-row transformation or user-data preservation work.

---

## 9. Phase 4 — UI

Covers **UI-1 … UI-12**, plus **G1–G4** and **G10**.

### Creation form

- **UI-1** delete the "Election schedule" block
  (`TemperatureCheckForm.tsx:554-599`) — heading, copy, and all four
  `datetime-local` inputs.
- **UI-2** delete `tcVotingStart`, `tcVotingEnd`, `votingStart`, `votingEnd`
  from `sharedFields` (`schema.ts:114-117`) and the entire cross-field
  `Schema.filter` at `:186-205`. Note these fields sit on **both** union
  members, so the Standard form carries them today too. Once the schedule filter
  is gone, also remove `DEFAULT_MIN_VOTING_UNITS`, the obsolete duration
  comments/imports, the `minimums` parameters on both schema factories, and the
  parameter-set-derived `minimums` calculation in
  `TemperatureCheckForm.tsx:93-109`. The submit validator then uses the static
  union schema.
- **UI-3** delete `makeMajorityJudgmentSchedule`,
  `defaultMajorityJudgmentSchedule`, `MINIMUM_SCHEDULE_LEAD_MS`,
  `roundUpToMinute`, and `formatLocalDateTime` from `formOptions.ts:54-100`
  (verify no other consumer), plus the re-seed effect at
  `TemperatureCheckForm.tsx:265-283` and the submit mapping at `:160-163`.
- **UI-4** `msPerGovernanceDurationUnit` and `formatGovernanceDuration`
  (`lib/governanceDuration.ts`) are **retained** — still used by the admin
  parameter-set panel and by UI-5.
- **UI-5** replace the inputs with a read-only derived-timeline summary, e.g.
  *"Candidate-list voting opens immediately on creation and runs for
  {tc.votingDays}. Grading opens when a Governance Operator starts it after the
  outcome is recorded, and runs for {election.votingDays}."* Use
  `formatGovernanceDuration` so Stokenet correctly reads "minutes".

### Operator controls

- **UI-6** add an **"Open Round 1 grading"** button to
  `MajorityJudgmentOwnerControls`, gated on
  `canOpenMajorityJudgmentRoundOne(status)`; remove the rerun
  `datetime-local` input (`:70-90`) so "Open Round 2 rerun" becomes a bare
  button. **G2** — extend the early return at `:60` to include the new
  capability, or the card never renders in `MJ_PENDING`. **G3** — make the
  `round` prop optional and include the Round 1 opener's waiting state in
  `busy`.
- **UI-7** both buttons **must** carry a confirmation step. Unlike
  `make_proposal`, this action is irreversible and immediately opens a live
  voting window with no lead time for voters (D4). Use the frozen durations from
  `majorityJudgmentRoundDurationsAtom` (**G10**), not the mutable current
  parameter registry. Each confirmation states the round duration, an estimated
  closing time based on the current browser clock, and that the exact deadline
  is set from ledger time when the transaction commits. Disable the action if
  the snapshotted duration cannot be loaded.
- **UI-8** add `startMajorityJudgmentRoundOneAtom` mirroring
  `startMajorityJudgmentRerunAtom` (`adminAtom.ts:188-224`), **including the
  collector pre-flight status check** — advisory only (the ledger will accept
  the call on a contradictory record, and the projection is what refuses to go
  `LIVE`), but it is the fail-closed guard that keeps the operator from acting
  on a stale view. Model the tagged error on
  `InvalidMajorityJudgmentRerunStatusError`. Remove `votingStart` from the
  rerun atom input and manifest call, and change rerun success copy from
  "scheduled" to "opened".
- **G10** add `majorityJudgmentRoundDurationsAtom(electionId)` beside the
  existing ledger-backed MJ atoms. It follows election → temperature check,
  asserts the snapshotted parameter set is Majority Judgment, and returns
  `{ votingDays, rerunVotingDays }`. This is display/confirmation data only;
  the ledger remains authoritative for the actual deadline.

### Display

- **UI-9** countdown ladder (`MajorityJudgmentElectionView.tsx:255-264`): both
  the `PENDING → "Candidate-list voting opens"` and `MJ_PENDING → "MJ grading
  opens"` countdowns lose their targets. `MJ_PENDING` renders a **static**
  state — *"Awaiting the Governance Operator to open grading"* — not a timer.
- **UI-10** `ElectionsList.tsx:29-39`: with no round, fall back to the TC window
  for the card date range and let the status badge convey the pending-operator
  state.
- **UI-11** `ElectionStagesCard.tsx:112-114, :121-123`: reword the existing
  `'Scheduled on-ledger'` fallback to *"Opens when the operator starts it"* and
  reuse it. No structural change.
- **UI-12** `election/$id/-$id/index.tsx:236-243` and `:331-355`, plus
  `MajorityJudgmentElectionView`, handle `currentRound === null` without
  crashing. Also guard the ballot submission at `:149` and tie-resolution
  dispatch at `:346`; make `quorumXrd` optional and suppress its badge until
  a round exists (**G3**).
- **G1** `majorityJudgmentAtom.ts:91` — return no voter entries when neither
  round exists.
- **G4** `ElectionTemperatureCheckStage.tsx:110` — show TC tallies during
  `MJ_PENDING`; hide them only during `PENDING`.

Tests: `schema.test.ts` (its `validForm` fixture at `:10-31` seeds all four
dates and is used by **every** test in the file, including Standard-form tests;
delete the schedule-minimum-specific cases as well),
`formOptions.test.ts` (its scheduling test is deleted outright),
`MajorityJudgmentElectionView.test.tsx`,
`MajorityJudgmentOwnerControls.test.tsx`, `TemperatureCheckForm.test.tsx`,
`ElectionsList.test.ts`, and a focused
`majorityJudgmentRoundDurationsAtom` test proving an updated current registry
does not replace the election's snapshotted durations. Owner-control tests cover
both confirmation paths, cancel vs confirm, disabled state while duration data
is unavailable, and the `MJ_PENDING` early-return regression.

---

## 10. Phase 5 — docs

Add a superseding note to
[`2026-08-01-majority-judgment-post-cr-remediation.md`](./2026-08-01-majority-judgment-post-cr-remediation.md)
covering **the scheduling model only** — its atomicity, snapshot, quorum, and
grade-floor rules stay intact. `scrypto/README.md` has no MJ content and is
already stale; out of scope unless separately requested.

Add the release/reset checklist for D5/G8:

1. deploy a new Scrypto package and component,
2. record the new network addresses in governance config,
3. stop the collector before changing its configured component,
4. wipe D1, recreate it from all migrations (including `0006`), and thereby
   reset the collector watermark/caches,
5. start the collector against only the new component and complete a fresh
   re-index,
6. run the Stokenet lifecycle smoke test below.

There is deliberately no dual-address interval or compatibility decoder.

---

## 11. Verification matrix

### Scrypto (`cd scrypto && scrypto test && scrypto build`)

1. Creation with a Standard parameter set still panics (SC-4).
2. TC `start == creation instant`, `deadline == start + tc.voting_days`;
   `round_one.is_none()` (SC-2, SC-5).
3. `start_majority_judgment_round_one` panics: before the TC deadline (PV-1);
   with no recorded outcome and on a recorded *failed* outcome (PV-2); for a
   non-owner (PV-3); on a second call (PV-4).
4. Opening after a passed outcome sets `start == now`, `deadline == now +
   election.voting_days`, `snapshot == temperature_check.snapshot` (PV-5), and
   quorum/grade from the creation-time snapshot.
5. **`update_governance_parameter_set` between creation and opening does not
   change the opened round's quorum or grade floor** (PV-6). This is the
   assertion most likely to be silently lost — SC-8 is the only thing standing
   between the snapshot invariant and a re-resolve.
6. Voting before opening panics with `"Round 1 has not opened"`;
   `start_majority_judgment_rerun` on an unopened election panics the same way
   rather than succeeding (PV-12).
7. Rerun opens at `now` with `deadline == now + rerun_voting_days` (SC-11).
8. Candidate list and shuffled order are unchanged by opening (PV-7).
9. Round 1 and rerun each emit
   `MajorityJudgmentRoundStartedEvent` with the correct round discriminant and
   the exact fields persisted in the opened round (EV-2).

### Indexer (`pnpm test` in `apps/consultation`)

10. An election with no `mj_round` row is returned by
   `getElectionsAwaitingTemperatureCheckGate` and its TC verdict is published
   (PV-13).
11. `getElectionResponse` serializes an explicit `currentRound: null` for an
    unopened election instead of erroring or omitting the property (IX-8).
12. `MJ_PENDING` re-sync does not regress to `TC_LIVE` (IX-4/PV-10);
    `MJ_PENDING → TC_FAILED` still lands (PV-9).
13. A `TC_LIVE` election with a newly projected Round 1 row reaches `LIVE`
    in one finalizer invocation because pass 2 queries after pass 1 (IX-10/G9).
14. A pass-1 `TC_FAILED` election is not processed by pass 2.
15. An in-flight `LIVE` election is still not terminable by a later cache change
    (PV-11) — regression guard on the `isPastTemperatureCheckGate` rename.
16. Both `RoundOne` and `Rerun` started events route to a live-state
    projection at the event's `state_version` (EV-2/G7).
17. A fresh D1 built from migrations contains the
    `mj_election.status` index; no data migration/backfill fixture is required.

### UI

18. The detail page and voting callback remain inert and render successfully
    while `currentRound` is `null`.
19. `MJ_PENDING` renders the Round 1 opener for an operator, shows TC tallies,
    and displays no grading countdown.
20. Both round-opening actions require confirmation, use durations from the
    election's frozen TC parameter snapshot, do nothing on cancel, and dispatch
    exactly once on confirm.
21. The confirmation distinguishes its estimated browser-clock close time from
    the exact deadline that will be established by ledger time.

### End-to-end on Stokenet (governance durations are *minutes*)

22. Create an MJ election; confirm the form has no date inputs and the TC is
    immediately open.
23. Confirm the election detail page renders during the TC phase — this is the
    IX-8 regression that 500s under the naive change.
24. Vote, wait out the TC, record the outcome; confirm status reaches
    `MJ_PENDING`, TC tallies remain visible, and the page shows "awaiting
    operator" with **no countdown**.
25. Click "Open Round 1 grading"; confirm the dialog shows the frozen duration
    and estimated closing time, grading opens immediately, and the exact
    on-ledger deadline equals `start + election.votingDays`.
26. Leave an election in `MJ_PENDING` well beyond the old scheduled window to
    confirm nothing times out or auto-advances.
27. Fail the first round on quorum, open the rerun through its confirmation, and
    confirm its deadline equals `start + rerunVotingDays`.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Release accidentally points the new collector at the superseded component or retains its cursor/cache. | D5/G8 is a hard deployment boundary: new address, stopped collector, wiped/recreated D1, fresh re-index, no dual-address interval. |
| An election can sit in `MJ_PENDING` indefinitely if the operator never acts — a liveness dependency on a human the calendar model did not have. | Accepted: it is the point of the change, and `make_proposal` already has this property. An operator-facing "awaiting action" queue is separate follow-up work. |
| IX-3 and IX-4 must land together; IX-3 alone reintroduces the `MJ_PENDING → TC_LIVE` flicker and the operator's button disappears on every event. | Both are in Phase 0, covered by the same test (§5.2, §5.5). |
| Phases 1–3 must deploy together; a collector built for the new event shapes cannot decode the superseded package's events. | Keep all phases on one task branch, verify the integrated result, then switch component/config/collector as one release (§4, §10). |
| Pass 2 reads rows loaded before pass 1 and misses or reverses the same-drain gate decision. | Query `getActiveElectionRounds()` only after pass 1 completes; cover both promotion and failure with regression tests (G9). |
| A confirmation presents a browser estimate as the authoritative deadline. | Show the frozen duration, label the time as estimated, and refresh to the exact ledger deadline after commit (G10/UI-7). |
| The unbounded `MJ_PENDING` wait hides the TC verdict that justifies opening grading. | Show TC tallies in `MJ_PENDING` and audit the remaining `MJ_PENDING` branches (`electionDisplay.ts:21`, `:70`, `ElectionStagesCard.tsx:33`) for short-window assumptions (G4). |
