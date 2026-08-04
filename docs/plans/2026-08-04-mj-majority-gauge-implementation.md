# Majority Judgment Majority-Gauge Tie Resolution — Implementation Plan

**Status:** plan — reviewed against `staging` and ready for implementation
**Date:** 2026-08-04
**Requirements source:** client change request `REQ-MJ-03 — Tie resolution by
majority gauge` (2026-08-03, ready for implementation)
**Verified against:** `staging` at `bf697a3`
**Supersedes:** the iterative middlemost-grade removal procedure in
[`2026-07-21-majority-judgment-elections-design.md`](./2026-07-21-majority-judgment-elections-design.md)

This plan converts REQ-MJ-03 into an ordered implementation sequence, maps
every normative requirement (`R1`–`R9`) to concrete code and tests, and closes
the integration gaps that are not explicit in the change request. It preserves
the existing on-ledger adjudication record, keeps runoff tallying outside
Consultation V2, and makes no Scrypto or blueprint change.

---

## 1. Outcome and non-goals

Replace the candidate-local ballot-removal loop with a closed-form majority
gauge computed from each candidate's immutable weighted grade histogram:

1. compute the weighted median once;
2. compute exact voting power strictly above and below it;
3. assign gauge band A, B, or C;
4. order by median, band, and the exact decisive power sum;
5. preserve comparator equality as a real tie with competition ranks and a tie
   group marker; and
6. stop seat assignment only when one such group crosses the seat boundary.

The published result must expose enough evidence to reproduce the ordering by
hand: histogram, median, exact `powerAbove` / `powerBelow`, display shares `p`
/ `q`, band, competition rank, tie group, and tie-group location.

Non-goals:

- no Scrypto struct, method, event, package, or component change;
- no third MJ round and no in-app runoff;
- no vacancy or later reserve-seating workflow;
- no governance-route enum or group-size branch in the calculator;
- no recomputation or mutation of a terminal historical result; and
- no removal of the checked `mj_result.tie_break_iterations` D1 column in this
  task.

---

## 2. Requirements verified against current `staging`

| Requirement | Current code | Planned disposition |
|---|---|---|
| Inputs | The blueprint and wire schema require one grade per candidate. The calculator still throws per candidate at `calculator.ts:116-139`, after positive ballots have already contributed to total power. | Validate each whole ballot once, exclude invalid ballots before `W`, and report exclusions to the Effect call sites for warning logs. |
| R1 median | `majorityGrade` at `calculator.ts:76-99` uses exact `2 * cumulative >= total`, but scans contribution arrays repeatedly. | Preserve the rule and compute it from the five exact histogram buckets. |
| R2 gauge | Not present. | Add exact `powerAbove` and `powerBelow`; divide only for published `p` and `q`. |
| R3 order | `compareWorkingCandidates` at `calculator.ts:141-151` orders same-median candidates by candidate ID. | Replace with the median/band/gauge comparator; return `0` for inseparable candidates. |
| R4 unresolved ties | The end-to-end on-ledger adjudication path exists, but `resolveBoundaryTie` at `calculator.ts:241-323` decides equality by iterative removal. | Delete the removal path; locate the one comparator-equal group crossing the seat cut and publish the complete group regardless of size. |
| R5 lazy resolution | Current code invokes tie handling only at the seat boundary and preserves decided candidates around an unresolved group. It does not publish reserve ties. | Build all electable tie groups, publish non-consequential groups, and halt only for the group crossing the seat cut. |
| R6 immutable/deterministic | Persisted ballots are not mutated, but the working removal copies violate the required algorithm. | Remove contribution selection/removal entirely; calculate from immutable histograms. |
| R7 floor first | `calculator.ts:363-369` filters by the original median before seating. | Preserve this order; non-electable candidates receive no band, rank, or tie group. |
| R8 evidence/ranks | The shared result at `majorityJudgment.ts:377-412` has `majorityGrade`, `finalMajorityGrade`, sequential rank, and `tieBreakIterations`; it lacks gauge evidence and tie groups. | Publish the new evidence, retire the removal-only fields, and assign competition ranks. |
| R9 exact comparisons | BigNumber is already used for histogram sums, but no gauge exists. | Compare only exact BigNumber sums; normalized shares are output-only. |

The existing adjudication route remains structurally valid:

```text
MajorityJudgmentTieResolutionRecorded event
  → poll.ts
  → MajorityJudgmentFinalizer.resolveTie
  → applyMajorityJudgmentTieResolution
  → MajorityJudgmentRepo.commitCalculation(allowTieResolution: true)
```

The stored unresolved set is still one seat-boundary group, so the existing
on-ledger single-resolution slot remains sufficient.

---

## 3. Integration gaps and implementation decisions

These decisions make the plan implementation-ready rather than leaving
ambiguous behavior to the coding phase.

### G1 — validate a ballot once, before the shared denominator

Changing `candidateContributions` to skip a ballot separately for each
candidate would let one ballot contribute to some histograms but not others,
breaking the invariant that every candidate has denominator `W`.

Add a pure whole-ballot validation/partition step before `totalVotingPower` is
calculated. A valid ballot must have exactly the known candidate IDs, each once,
with every grade in `0..4`. Unknown IDs, missing IDs, duplicate IDs, invalid
grades, and non-positive voting power are excluded from all candidates and from
`W`.

Keep the calculator pure by returning internal diagnostics containing excluded
`voteId`s and reasons. `MajorityJudgmentCalculation` and
`MajorityJudgmentFinalizer` log one warning summary per calculation; diagnostics
are not persisted or exposed by the public API.

### G2 — publish fully seated ties as ties

REQ-MJ-03 names `SEAT_BOUNDARY` and `RESERVE` locations, but a comparator-equal
group can also fit wholly above the seat boundary. All its members are seated,
yet R8 still forbids pretending they have a total order.

Use the presentation/audit location union:

```ts
type MajorityJudgmentTieGroupLocation =
  | 'SEATED'
  | 'SEAT_BOUNDARY'
  | 'RESERVE'
```

`SEATED` does not create a governance route or affect tally behavior; it merely
describes a published equal-rank group whose members all won seats. Only
`SEAT_BOUNDARY` changes status to `TIE_UNRESOLVED`.

### G3 — make tie groups explicit without another D1 column

The requested candidate fields include `tieGroupId`, while the result-level
data model also requires members plus location. Define a public
`MajorityJudgmentTieGroup` with `{ id, candidateIds, location }` and expose a
`tieGroups` array on `MajorityJudgmentResultResponse`.

Persist only `tieGroupId` and outcome in each candidate JSON object. The repo
derives `tieGroups` when mapping a result:

- group candidates by non-null `tieGroupId`;
- `UNRESOLVED` members imply `SEAT_BOUNDARY`;
- all `SEATED` members imply `SEATED`; and
- all `RESERVE` members imply `RESERVE`.

Mixed outcomes inside a persisted tie group are an invariant error. This keeps
the database schema unchanged while publishing the complete result shape.

Use the group's competition rank as its `tieGroupId`. It is deterministic,
stable across ballot/database insertion order, and naturally unique among
ordered comparator groups.

### G4 — adjudication must not erase unrelated competition ties

`applyMajorityJudgmentTieResolution` currently sorts candidates by rank and then
assigns sequential ranks to every electable candidate (`calculator.ts:512-555`).
After R8 this would silently destroy all reserve or fully seated competition
ties, even though the adjudication concerns only the seat-boundary group.

Rewrite it to:

1. validate that the supplied order contains exactly the stored
   `unresolvedCandidateIds`;
2. preserve all groups and ranks strictly above and below the unresolved group;
3. calculate how many seats are still open above the group;
4. use only the required prefix of the recorded order to fill those seats; and
5. leave two or more non-seated remainder members tied on the reserve list with
   one shared competition rank and reserve tie-group marker.

This adopts the change request's recommendation for oversized groups: the
adjudication/runoff determines the immediate seating only; it does not become a
permanent reserve ordering. A one-member remainder is no longer a tie.

The on-ledger method may still record a full ordering because that is its
existing input shape; the calculator deliberately consumes only the prefix
needed to settle the contested seats.

### G5 — preserve historical results without weakening the new API

Stored `candidate_results` JSON predates the new required fields. Decoding it
directly with the new Effect schema would make historical elections fail to
load. Re-ranking old terminal results would violate immutability.

Use a versioned stored-JSON union in `repo.ts` / `packages/database/src/schema.ts`:

- legacy objects have `majorityGrade`, `finalMajorityGrade`, and the old rank;
- gauge objects have `median`, exact gauge evidence, band, competition rank,
  and `tieGroupId`.

Normalize both to the new public candidate shape before
`MajorityJudgmentElectionResponseSchema` decoding. For legacy rows:

- set `median` from `majorityGrade`;
- derive `powerAbove`, `powerBelow`, `p`, `q`, and band with BigNumber from the
  stored histogram;
- preserve the published historical rank, outcomes, seated/reserve lists, and
  unresolved group exactly;
- set `tieGroupId` to `null` rather than inventing tie semantics that were not
  published; and
- expose result-level `calculationMethod: 'LEGACY_BALLOT_REMOVAL'`.

New rows expose `calculationMethod: 'MAJORITY_GAUGE'`. The UI labels legacy
results and explains that reconstructed gauge values are evidence only; the
historical rank came from the superseded method. Detection is based on the
stored candidate JSON shape, so no D1 column or data rewrite is required.

Rows already in `TIE_UNRESOLVED` retain their stored unresolved group and remain
resolvable through the existing ledger event path.

### G6 — retire removal fields at domain boundaries, retain the checked column

Remove `finalMajorityGrade` and `tieBreakIterations` from calculator output,
shared public response types, logs, and UI. Keep
`mj_result.tie_break_iterations` and its CHECK constraint. The repo writes a
literal `0` for every new calculation, and its write input no longer asks all
callers to thread the value through.

The legacy DB value may remain readable internally for operational forensics,
but it is not part of the new public result contract.

### G7 — route wording is presentation-only

For a `SEAT_BOUNDARY` tie, the results view may derive:

- two members → RAC adjudication; and
- more than two members → external runoff.

Update the public explanation and Governance Operator control copy to say
“recorded governance determination” rather than assuming every group is an RAC
ordering. The calculator, persisted candidate shape, and shared result schema
must contain no route enum and no group-size branch.

---

## 4. Working agreement and implementation sequence

Implementation is one task in one linked worktree from `staging`:

```bash
pnpm worktree:task mj-majority-gauge staging
```

Use one `task/mj-majority-gauge` branch and one pull request against `staging`.
The phases below are checkpoints on that branch, not separate PRs. The shared
schema, persistence mapper, and UI changes form one TypeScript checkpoint and
should be verified together.

The task is complete only when `pnpm verify` passes and the changes are
committed. The PR is squash-merged into `staging` after required CI and Claude
Code Review are green; then the staging Worker deployment and preview behavior
are verified. Production promotion is deliberately outside this task.

---

## 5. Phase 1 — calculator domain rewrite

**Primary file:**
`apps/consultation/src/server/voting/majority-judgment/calculator.ts`

Covers R1–R7 and R9.

### 5.1 Remove the iterative mechanism

Delete:

- `compareContributions` and `selectMedianContribution`;
- `ContributionBuckets`, `GradeWeights`, and `TieCandidate`;
- `majorityGradeFromWeights`, `makeTieCandidate`, and
  `rankedTieCandidates`;
- `removeMedianContribution` and `resolveBoundaryTie`;
- account/vote metadata from candidate contribution structures;
- `finalMajorityGrade`; and
- the calculator-level `tieBreakIterations` result.

`GradeContribution` can be retired if no test/helper still needs it. No
replacement code may remove, mutate, or reweight a grade.

### 5.2 Build exact histograms in one pass

Canonicalize candidate IDs first and reject duplicate candidate definitions as
an invariant error. Partition ballots as described in G1, then initialize five
BigNumber buckets per candidate and add each valid ballot's full voting power to
exactly one bucket per candidate.

Compute `W` from the same valid ballots. Assert each candidate histogram sums
exactly to `W`; if not, fail the calculation before persistence.

Refactor the median helper to accept the five-bucket histogram and walk grades
`4 → 0`, returning the first grade where `2 * cumulative >= W`. `W = 0`
produces `median = null`.

### 5.3 Compute the majority gauge

For every candidate with a median:

```ts
powerAbove = sum(histogram[g] for g > median)
powerBelow = sum(histogram[g] for g < median)
band = powerAbove > powerBelow ? 'A'
     : powerAbove < powerBelow ? 'C'
     : 'B'
```

Compare exact BigNumber sums only. Publish:

```ts
p = W === 0 ? '0' : powerAbove.dividedBy(W).toFixed()
q = W === 0 ? '0' : powerBelow.dividedBy(W).toFixed()
```

The divided values are display output and must never be read by the comparator,
tie-group builder, seat assignment, or adjudication application.

For non-electable candidates, publish the median and exact/display gauge
components for audit, but set `band`, `rank`, and `tieGroupId` to `null` as
required by the change request's data model.

### 5.4 Order and competition-rank electable candidates

Implement one comparator:

1. median descending;
2. band order A, B, C;
3. band A: `powerAbove` descending;
4. band C: `powerBelow` ascending; and
5. band B, equal-A, or equal-C: return `0`.

Never append candidate ID as a semantic tiebreak. Candidate ID may be used only
to make serialized member arrays deterministic after equality has already been
recorded as a tie.

Sort the electable candidates, scan adjacent comparator-equal runs, and assign:

- competition rank equal to the run's one-based start position;
- the same rank to every member;
- the next distinct rank after the full run (`1, 2, 2, 4`); and
- `tieGroupId = rank` only when the run has at least two members.

### 5.5 Assign seats by groups, not by a totalized array

Apply the electability floor before this phase. Locate the group for which:

```text
groupStart < seatCount < groupEnd
```

At most one group can satisfy the predicate; assert this invariant.

- No straddling group: status is `FINAL`; groups wholly above the cut are
  seated and groups wholly below are reserve. Publish ties in both regions.
- Straddling group: status is `TIE_UNRESOLVED`; publish every member as
  `UNRESOLVED`, seat all candidates strictly above, reserve all candidates
  strictly below, and set `unresolvedCandidateIds` to exactly that full group.

The check is unconditional on group size. Do not add a route enum, pair special
case, or electability-boundary tie check.

Preserve current quorum, referral, reserve-expiry, Round 1 failure, and rerun
failure semantics. An open tie has no reserve expiry and zero referred seats,
as today.

### 5.6 Rewrite adjudication application

Implement G4 in `applyMajorityJudgmentTieResolution` and add explicit invariant
checks for:

- exact set equality with `unresolvedCandidateIds`;
- one and only one unresolved tie group;
- the group crossing the seat boundary;
- no changes to candidates outside that group; and
- no reserve ordering inferred beyond the number of contested seats.

Return a normal `FINAL` result with the boundary group cleared from
`unresolvedCandidateIds`. Recompute ranks/tie markers only where the
adjudication split changes them; preserve unrelated groups.

---

## 6. Phase 2 — shared result contract and persistence normalization

### 6.1 Shared schemas

**File:** `packages/shared/src/governance/majorityJudgment.ts`

Add:

```ts
const MajorityJudgmentGaugeBandSchema = Schema.Literal('A', 'B', 'C')
const MajorityJudgmentTieGroupLocationSchema = Schema.Literal(
  'SEATED',
  'SEAT_BOUNDARY',
  'RESERVE'
)
const MajorityJudgmentCalculationMethodSchema = Schema.Literal(
  'LEGACY_BALLOT_REMOVAL',
  'MAJORITY_GAUGE'
)
```

Replace candidate result fields with:

```ts
candidateId
histogram
median
powerAbove
powerBelow
p
q
band
electable
rank
tieGroupId
outcome
```

Retire `majorityGrade` and `finalMajorityGrade` from the public shape; the
single `median` name is authoritative. Add result-level `calculationMethod` and
`tieGroups`; retire public `tieBreakIterations`. Keep
`unresolvedCandidateIds` scoped to the seat-boundary group only.

Update `packages/shared/src/governance/majorityJudgment.test.ts` with valid
current and normalized-legacy response fixtures plus rejection cases for
invalid band, tie-group location, and candidate IDs.

### 6.2 Database JSON types

**File:** `packages/database/src/schema.ts`

Model `candidate_results` as a union of:

- `LegacyMajorityJudgmentCandidateResultJson`; and
- `MajorityGaugeCandidateResultJson`.

This is a TypeScript JSON-column type change only. Do not alter the D1 table or
generate a migration. Keep `tieBreakIterations` in `mjResult` and its CHECK.

### 6.3 Repository normalization and write path

**File:** `apps/consultation/src/server/voting/majority-judgment/repo.ts`

Before decoding with the public schema:

1. decode stored candidate JSON through the legacy/current union;
2. normalize legacy objects per G5 using exact BigNumber operations;
3. derive `calculationMethod` from the stored shape;
4. derive and validate result-level tie groups per G3; and
5. pass only the normalized public object to
   `MajorityJudgmentElectionResponseSchema`.

The normalization helper should be pure, exported for focused tests, and used
by both `getResult` and `getElectionResponse` so finalization/tie resolution and
HTTP responses cannot disagree.

On write, bind `0` to `tie_break_iterations` inside the repository rather than
accepting it in `MajorityJudgmentResultWrite`. Remove the field from INSERT
callers and `mapResult` output.

### 6.4 Mechanical callers and logs

Update:

- `majority-judgment/calculation.ts`;
- `majority-judgment/finalizer.ts`; and
- any schema fixtures or worker persistence fixtures.

Replace tie-iteration/final-grade debug fields with:

- median;
- exact power above/below;
- band;
- competition rank;
- tie-group members/location;
- excluded-ballot diagnostic count; and
- seating/reserve/unresolved outputs.

Do not log full ballot grade payloads as part of the new exclusion warning.

---

## 7. Phase 3 — results and operator UI

### 7.1 Candidate evidence

**File:**
`apps/consultation/src/routes/election/$id/-$id/components/CandidateCard.tsx`

Replace the majority/final-majority copy with an audit block showing:

- median grade;
- band and plain-language direction;
- `p` and `q` as readable percentages;
- exact `powerAbove` and `powerBelow` strings in XRD-equivalent units;
- competition rank; and
- a visible tied-rank/tie-group badge when `tieGroupId` is non-null.

Keep histogram bars for readability, but do not use JavaScript `Number` output
as the exact evidence value. The raw decimal strings must remain available in
text so high-precision comparisons are auditable.

### 7.2 Outcome ordering and tie treatment

**Files:** `ElectionOutcomeCard.tsx`, `CandidateList.tsx`, and
`MajorityJudgmentElectionView.tsx`

- Sort by rank, with candidate display order only as a rendering order inside
  an already-labelled tie.
- Render equal ranks explicitly as equal (`#2 tied`, not apparent duplicate or
  accidental order).
- Group tie members visually and show `SEATED`, `SEAT_BOUNDARY`, or `RESERVE`.
- Replace the tie-iteration result note with majority-gauge explanatory copy.
- Present `TIE_UNRESOLVED` as a published finding awaiting a governance input,
  not a calculation error.
- For a boundary group, derive the RAC-vs-external-runoff explanation from
  member count in the view only.
- Label `LEGACY_BALLOT_REMOVAL` results and explain that their preserved rank
  predates the majority gauge.

Remove `finalMajorityGrade ?? majorityGrade` from `ElectionOutcomeCard`; use
`median` only.

### 7.3 Governance Operator control copy

**Files:** `MajorityJudgmentOwnerControls.tsx` and its tests

Keep the existing generic ordered-candidate input and transaction. Change the
copy to “recorded governance determination” and display the derived source:

- RAC adjudication for two candidates; or
- externally conducted runoff for larger groups.

Do not add a runoff button, status, round, tally, or parameter. The submitted
ordered IDs remain the exact unresolved group.

### 7.4 UI tests

Extend `MajorityJudgmentElectionView.test.tsx` and
`MajorityJudgmentOwnerControls.test.tsx` to cover:

- exact gauge evidence and median copy;
- A/B/C labels;
- duplicate competition ranks rendered as ties;
- seated, boundary, and reserve group treatments;
- two-member RAC and larger-group external-runoff wording;
- removal of tie-iteration/final-grade copy; and
- legacy-method disclosure.

---

## 8. Phase 4 — documentation

Update
[`2026-07-21-majority-judgment-elections-design.md`](./2026-07-21-majority-judgment-elections-design.md):

- rewrite “Electability and seating” step 2 around gauge ordering and lazy
  boundary resolution;
- replace “Deterministic tie procedure” with the exact median/gauge/band rules,
  competition ranking, and unresolved-group semantics;
- replace persisted/logged removal iterations and final working grade with the
  gauge evidence and tie groups;
- update the auditability property at current line 722; and
- clarify that an oversized group is resolved externally and recorded through
  the existing generic adjudication input.

Add a short historical note that terminal results produced under the prior
algorithm remain frozen and are labelled legacy in the application.

Do not edit Scrypto documentation as if a blueprint change or redeploy were
required.

---

## 9. Test plan

### 9.1 Calculator unit tests

Rewrite
`apps/consultation/src/server/voting/tests/majorityJudgmentCalculation.test.ts`:

1. median at every grade and the exact-half boundary;
2. whole-ballot exclusion for missing, duplicate, unknown, and invalid grades;
3. exclusion before `W`, proving all candidate histogram sums remain equal;
4. band A above B above C at an equal median;
5. within A, higher exact `powerAbove` first;
6. within C, lower exact `powerBelow` first;
7. band B inseparability even when `p = q` magnitudes differ;
8. equal-power A and equal-power C unresolved groups;
9. precision beyond 20 decimal places, proving shares are not compared;
10. competition ranks `1, 2, 2, 4` and no candidate-ID winner;
11. a fully seated tie published without halting;
12. a reserve tie published with `FINAL` status;
13. two- and five-member boundary groups taking the same halt path;
14. only the boundary group appearing in `unresolvedCandidateIds`;
15. grade floor applied before gauge seating;
16. insertion-order byte-for-byte determinism;
17. adjudication changing only the contested seats and preserving unrelated
    ties;
18. oversized adjudication leaving a multi-member reserve remainder tied;
19. randomized/property coverage that at most one group straddles a single
    seat cut; and
20. the existing 20-candidate / 10,000-ballot performance budget.

Delete the `selectMedianContribution` test and tie-iteration assertions. Trace
the four existing seating fixtures against their majority-gauge expectations
so outcome changes are intentional and reviewable.

### 9.2 Shared and persistence tests

- Shared Effect schema round-trip for current gauge results.
- Legacy stored JSON normalization preserves rank/outcome and derives exact
  evidence.
- A historical `TIE_UNRESOLVED` row remains resolvable.
- New writes persist gauge candidate JSON and literal
  `tie_break_iterations = 0`.
- Result-level tie-group derivation rejects mixed or inconsistent outcomes.
- D1 worker test reads both legacy and current rows through the same HTTP
  response schema.
- Existing terminal result guard and `allowTieResolution` transition remain
  intact.

### 9.3 UI tests

Cover the Phase 3 cases at component level. Prefer semantic text/role assertions
over snapshots so the audit copy is reviewed explicitly.

---

## 10. Requirement-to-phase traceability

| Requirement | Implementation phase | Primary verification |
|---|---|---|
| Inputs | 5.2, 6.4 | invalid-ballot exclusion and equal-histogram-sum tests |
| R1 | 5.2 | weighted median / exact-half tests |
| R2 | 5.3 | exact above/below and published share tests |
| R3 | 5.4 | band and within-band ordering tests |
| R4 | 5.5, 5.6, 7.2–7.3 | equal-gauge groups, pair/five-way halt, adjudication tests |
| R5 | 5.5, 7.2 | seated/reserve non-consequential tie tests |
| R6 | 5.1–5.2 | no removal symbols, determinism tests |
| R7 | 5.5 | grade-floor non-promotion test |
| R8 | 6.1, 7.1–7.2 | schema and UI audit-evidence tests |
| R9 | 5.3–5.4 | >20-decimal precision test and comparator review |

---

## 11. Expected file set

Core/domain:

- `apps/consultation/src/server/voting/majority-judgment/calculator.ts`
- `apps/consultation/src/server/voting/majority-judgment/calculation.ts`
- `apps/consultation/src/server/voting/majority-judgment/finalizer.ts`
- `apps/consultation/src/server/voting/majority-judgment/repo.ts`
- `apps/consultation/src/server/voting/tests/majorityJudgmentCalculation.test.ts`
- `apps/consultation/src/majorityJudgmentDatabase.worker.test.ts`

Contracts/storage:

- `packages/shared/src/governance/majorityJudgment.ts`
- `packages/shared/src/governance/majorityJudgment.test.ts`
- `packages/database/src/schema.ts`

UI:

- `apps/consultation/src/routes/election/$id/-$id/components/CandidateCard.tsx`
- `apps/consultation/src/routes/election/$id/-$id/components/CandidateList.tsx`
- `apps/consultation/src/routes/election/$id/-$id/components/ElectionOutcomeCard.tsx`
- `apps/consultation/src/routes/election/$id/-$id/components/MajorityJudgmentElectionView.tsx`
- `apps/consultation/src/routes/election/$id/-$id/components/MajorityJudgmentElectionView.test.tsx`
- `apps/consultation/src/routes/election/$id/-$id/components/MajorityJudgmentOwnerControls.tsx`
- `apps/consultation/src/routes/election/$id/-$id/components/MajorityJudgmentOwnerControls.test.tsx`

Documentation:

- `docs/plans/2026-07-21-majority-judgment-elections-design.md`

No file under `scrypto/` and no D1 migration should change. If implementation
discovers that either is necessary, stop and re-scope rather than widening the
task silently.

---

## 12. Verification and rollout

During implementation, run focused checks after each coherent phase:

```bash
pnpm --filter consultation-dapp test -- \
  src/server/voting/tests/majorityJudgmentCalculation.test.ts
pnpm --filter shared exec vitest run src/governance/majorityJudgment.test.ts
pnpm --filter consultation-dapp test:worker
```

Final verification:

```bash
pnpm verify
```

`pnpm verify` includes Biome, TypeScript, web/shared unit tests, Workerd/D1
tests, `scrypto test`, and `scrypto build`. Do not substitute `cargo test` for
the Scrypto verification even though no Scrypto files are expected to change.

Open the task PR against `staging`, wait for Claude Code Review and all required
CI, address any findings, and squash-merge. Monitor exact-`staging` CI and the
automatic shared-preview deployment. Verify on the staging Worker:

- one synthetic result for each gauge band;
- equal competition ranks and visible tie groups;
- a reserve tie that leaves status `FINAL`;
- a seat-boundary tie that leaves status `TIE_UNRESOLVED` and the correct
  derived governance-route copy; and
- a legacy result, if staging data contains one.

Do not open or merge a `staging → main` production promotion as part of this
implementation task.

---

## 13. Estimate

| Area | Estimate |
|---|---|
| Calculator rewrite, grouping, adjudication semantics | 2 days |
| Shared/storage normalization and compatibility | 1–1.5 days |
| Results/operator UI and audit presentation | 1.5 days |
| Unit, Worker, and component tests | 1–1.5 days |
| Design-document update and staging verification | 0.5 day |
| **Total** | **6–7 days** |

The upper end accounts for legacy-result normalization and the adjudication
rank-preservation gap, neither of which is safely handled by a purely mechanical
replacement of `resolveBoundaryTie`.
