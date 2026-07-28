# Majority Judgment Elections

## Review Brief

This document is a self-contained design and implementation plan for adding Majority Judgment (MJ) role elections to Consultation V2. It is written for a reviewer who has this repository and this file, but no access to the design conversation that produced it.

The implementation is intentionally split from the named governance parameter-set work in [`2026-07-21-named-governance-parameter-sets-design.md`](./2026-07-21-named-governance-parameter-sets-design.md). Named parameter sets are Phase 1. Majority Judgment is Phase 2 and builds on that registry rather than expanding the existing standard proposal record until it contains unrelated election fields.

No code or deployment changes are included in this plan.

## Executive Decision

Implement Majority Judgment as a separate on-ledger election entity with its own rounds, ballots, collector projection, calculation engine, database tables, API response, and UI route.

Do not model Temperature Checks, Governance Proposals, and Majority Judgment as three equivalent vote types:

```text
Standard proposal categories:
Draft -> Temperature Check -> Standard Governance Proposal

Election category after MJ adoption:
Nomination and Discussion -> Short Temperature Check -> Majority Judgment Election
```

A Temperature Check is a lifecycle stage. Majority Judgment is the formal voting mechanism for the Election proposal category. The passed TC therefore needs a typed continuation: either a standard proposal or an MJ election.

The two engineering phases may be implemented consecutively before launch. They do not require an intermediate production release.

## Governance Prerequisite

The pinned governance framework at commit `39824bbf49fa372b92763ea7ce3811e502bd3ddb` does not yet make Majority Judgment the operative election mechanism:

- [Proposal & Voting Framework §4.5 and §6.2.4–§6.2.5](https://github.com/Shadaffy/radix-dao-governance/blob/39824bbf49fa372b92763ea7ce3811e502bd3ddb/pending/governance/proposal-and-voting-framework.md) describe two-stage Approval Voting followed by confirmation as the current process and MJ as a future governance-activated replacement.
- [Elections & Role Governance Policy §7](https://github.com/Shadaffy/radix-dao-governance/blob/39824bbf49fa372b92763ea7ce3811e502bd3ddb/pending/governance/elections-and-role-governance-policy.md) likewise makes the two-stage process operative.
- [GP-ELECT-1](https://github.com/Shadaffy/radix-dao-governance/blob/39824bbf49fa372b92763ea7ce3811e502bd3ddb/pending/GP-ELECT-1-Permanent-RAC-Election.md) currently identifies the first Permanent RAC election as two-stage.
- [DAO Parameters §6B](https://github.com/Shadaffy/radix-dao-governance/blob/39824bbf49fa372b92763ea7ce3811e502bd3ddb/pending/parameters/dao-parameters-registry.md) does not yet contain the MJ review, grade-floor, or rerun parameters.

If the first Permanent RAC election will use MJ, these pending documents must be amended before GP-PRE-1 ratifies the framework. At minimum, the adopted text must define:

1. MJ as the operative election mechanism.
2. The minimum median grade, reduced-quorum rerun, raised rerun grade, and rerun duration.
3. Reserve-list behavior for MJ.
4. The deterministic tie procedure and the authority/process for a genuinely unresolved tie.
5. The RAC process for translating the policy quorum percentages into fixed XRD amounts maintained by Consultation V2.

This implementation must not be used merely because the tooling exists. Tooling and the adopted governance rules must agree.

No runtime feature flag is required after adoption. Before adoption, the MJ parameter profile must not be installed on the deployed component.

## Settled Product Decisions

- Quorum remains a fixed XRD-equivalent `Decimal` on-ledger. The component will not attempt to determine circulating or eligible supply.
- The RAC is responsible for deriving, publishing, and keeping the fixed XRD quorum values current before an election TC is created.
- The parameter profile selected at TC creation is snapshotted. Subsequent profile edits or retirement cannot alter that TC, its MJ election, or either election round.
- Parameter profiles are never deleted. They may be retired. Existing consultations retain their snapshots.
- No new Scrypto role is introduced. Existing owner authorization protects formal election creation, rerun initiation, visibility controls, and unresolved-tie recording.
- Public users can create election TCs by selecting an active MJ profile. No RAC badge is required to choose the consultation type.
- The final candidate set, role identifier, and seat count are committed in the election TC. Formal election creation may reorder candidates for display but cannot add, remove, or replace them.
- Voter ownership is enforced on-ledger. Positive snapshot voting power is enforced by the collector because the component has no reliable balance oracle.
- Round 1 uses the snapshot instant inherited from the TC. A rerun uses a fresh snapshot taken when the owner initiates the rerun.
- One rerun is supported. Supporting more would require a governance and code change.
- There is no backwards-compatibility wrapper, legacy component migration, historical backfill, or result-history UI. The software is pre-launch and will be deployed as one coordinated schema version.
- A database schema migration will add the new tables, but it will not migrate or backfill old consultation data.

## Authoritative Inputs and Precedence

The implementation should use the following precedence when inputs disagree:

1. The user's settled product decisions recorded in this plan.
2. The governance framework after its MJ amendments are adopted.
3. The attached `Majority-Judgment-Requirements.md` product requirements.
4. Existing repository behavior and conventions.

The attached requirements contain three statements superseded by this plan:

- Percentage quorum fields and eligible-supply calculations become fixed XRD quorum values.
- The contradictory requirement that positive voting power both must be enforced on-chain and may be deferred is resolved in favor of off-chain enforcement.
- Backwards compatibility and versioned historical result records are not required before launch.

The requirements' statement that MJ is already ratified also conflicts with the pinned pending framework. The governance prerequisite above controls deployment.

## Current Repository Boundaries

| Concern | Current location | Relevant behavior |
|---|---|---|
| Scrypto domain records | `scrypto/src/lib.rs` | Defines TC/GP records, options, votes, and events. |
| Governance blueprint | `scrypto/src/governance.rs` | Public TC creation/voting; owner-only GP elevation and configuration. |
| Scrypto tests | `scrypto/tests/lib.rs` | Uses `LedgerSimulator`; currently covers standard entities and delegation. |
| SBOR and domain schemas | `packages/shared/src/governance/schemas.ts`, `packages/shared/src/schemas.ts` | Decodes component/KVS records and builds typed domain models. |
| Gateway component service | `packages/shared/src/governance/governanceComponent.ts` | Reads component/KVS state and builds manifests. |
| Event projection | `apps/vote-collector/src/governanceEvents.ts`, `apps/vote-collector/src/poll.ts` | Streams detailed events from a ledger cursor and triggers calculations. |
| Voting-power snapshot | `apps/vote-collector/src/vote-calculation/votePowerSnapshot.ts` | Computes XRD-equivalent power for supplied accounts at a ledger state. |
| Existing tally | `apps/vote-collector/src/vote-calculation/voteCalculation.ts` | Deduplicates votes, snapshots first-time voters, and handles revotes. |
| Persistence | `packages/database/src/schema.ts`, `packages/database/drizzle/` | Drizzle schema and migrations used through Effect services. |
| Result API | `apps/vote-collector/src/http-server.ts`, `apps/vote-collector/src/handlers.ts` | Hono locally and Lambda handlers in SST. |
| Frontend state | `apps/consultation/src/atom/` | Effect Atom services for ledger data, transactions, and results. |
| Frontend routes | `apps/consultation/src/routes/` | TanStack Router TC and proposal screens. |

The new implementation must follow these boundaries rather than introducing a second Gateway client, raw Promise-based collector, or unrelated database access layer.

## Relationship to Named Parameter Sets

Phase 1 proposes one string-keyed `KeyValueStore` of named, versioned, retire-only parameter records. Phase 2 keeps that one registry and changes the record's parameter payload into a tagged enum.

Conceptual Scrypto shape:

```rust
pub enum GovernanceProcessParameters {
    Standard {
        temperature_check: TemperatureCheckParameters,
        proposal: StandardProposalParameters,
    },
    MajorityJudgment {
        temperature_check: TemperatureCheckParameters,
        election: MajorityJudgmentParameters,
    },
}

pub struct GovernanceParameterSetInput {
    pub label: String,
    pub parameters: GovernanceProcessParameters,
}

pub struct GovernanceParameterSet {
    pub label: String,
    pub version: u32,
    pub retired: bool,
    pub parameters: GovernanceProcessParameters,
}
```

The Phase 1 `GovernanceParameters` six-field value becomes the `Standard` variant during Phase 2. The reserved `default` profile must always remain `Standard`. An update may change the fields of a profile but may not change its enum variant; changing a stable identifier from Standard to MJ, or vice versa, would change the meaning of the identifier.

There is no second registry and no on-ledger identifier index. The Gateway continues to enumerate the string-keyed KVS at a stable ledger state for the UI.

Exact parameters:

```rust
pub struct TemperatureCheckParameters {
    pub voting_days: u32,
    pub quorum: Decimal,
    pub approval_threshold: Decimal,
}

pub struct StandardProposalParameters {
    pub voting_days: u32,
    pub quorum: Decimal,
    pub approval_threshold: Decimal,
}

pub struct MajorityJudgmentParameters {
    pub review_days: u32,
    pub voting_days: u32,
    pub quorum: Decimal,
    pub minimum_median_grade: Grade,
    pub rerun_voting_days: u32,
    pub rerun_quorum: Decimal,
    pub rerun_minimum_median_grade: Grade,
    pub reserve_list_days: u32,
}
```

Durations are exact values selected for the deployed profile. The component validates that they are non-zero and that timestamp arithmetic succeeds. It does not impose an additional policy maximum on a number of days.

Initial MJ profile values are installed by an owner-authorized transaction after the governance text and fixed XRD quorum amounts are approved. They are not hardcoded in the blueprint.

## Typed TC Continuation

Replace the assumption that every TC contains standard GP options and can only elevate to `Proposal`.

Conceptual draft shape:

```rust
pub enum TemperatureCheckFollowUpDraft {
    StandardProposal {
        vote_options: Vec<ProposalVoteOptionInput>,
        max_selections: Option<u32>,
    },
    MajorityJudgmentElection {
        role_id: String,
        seat_count: u32,
        candidates: Vec<MajorityJudgmentCandidateInput>,
    },
}

pub struct TemperatureCheckDraft {
    pub title: String,
    pub short_description: String,
    pub description: String,
    pub links: Vec<Url>,
    pub follow_up: TemperatureCheckFollowUpDraft,
}
```

The selected parameter-profile variant and `follow_up` variant must match. This prevents an MJ profile being used to create a standard GP or a standard profile being used to bypass the election flow.

The stored TC contains the normalized follow-up data and a tagged parameter-set snapshot. For MJ, candidate IDs are assigned at TC creation and become immutable before the community votes on the TC.

Replace:

```rust
pub elevated_proposal_id: Option<u64>
```

with:

```rust
pub enum ConsultationContinuation {
    Proposal(u64),
    MajorityJudgmentElection(u64),
}

pub continuation: Option<ConsultationContinuation>
```

`make_proposal` accepts only a TC whose profile and follow-up are Standard. `make_majority_judgment_election` accepts only a TC whose profile and follow-up are MJ. Both reject a TC with an existing continuation.

No old field or method wrapper is retained after the coordinated pre-launch deployment.

## Scrypto Domain Model

### Identifiers and grades

Use component-scoped numeric identifiers, matching existing TC and proposal conventions:

```rust
pub struct MajorityJudgmentElectionId(pub u64);
pub struct MajorityJudgmentCandidateId(pub u32);

pub enum Grade {
    Poor,
    Acceptable,
    Good,
    VeryGood,
    Excellent,
}
```

The SBOR enum discriminant is authoritative on-ledger. Shared code maps it to the ordered score `0..=4` only at the application boundary. Calculation code must use one explicit grade-order function rather than relying on TypeScript enum ordering.

An election's globally unambiguous identity is `(component_address, election_id)`. A candidate's identity is `(component_address, election_id, candidate_id)`. Globally unique strings are unnecessary on-ledger.

### Candidate commitment

```rust
pub struct MajorityJudgmentCandidateInput {
    pub reference: String,
    pub display_name: String,
    pub description: String,
    pub links: Vec<Url>,
}

pub struct MajorityJudgmentCandidate {
    pub id: MajorityJudgmentCandidateId,
    pub reference: String,
    pub display_name: String,
    pub description: String,
    pub links: Vec<Url>,
    pub display_order: u32,
}
```

`reference` is a stable public identifier such as a forum profile or nomination reference and must be unique within the election. IDs are assigned by the component at TC creation. The formal election copies the exact candidate set from the TC.

Support 2–20 candidates per election. Twenty matches the performance scope in the supplied requirements and bounds manifest size, on-ledger ballot size, and per-vote validation work. `seat_count` must be at least 1 and strictly less than the candidate count.

The owner-authorized election-creation manifest supplies one permutation of the committed candidate IDs. The component verifies that it contains every candidate exactly once, stores it as `display_order`, and cannot later change it. The admin client creates this permutation using a cryptographically secure Fisher–Yates shuffle.

This guarantees a stable, recorded shuffled order but does not provide trustless on-ledger randomness. If governance later requires a verifiably unbiased entropy source, that is a separate protocol decision.

### Complete ballot

Use a vector rather than a manifest map:

```rust
pub struct CandidateGrade {
    pub candidate_id: MajorityJudgmentCandidateId,
    pub grade: Grade,
}

pub struct MajorityJudgmentVoteRecord {
    pub voter: Global<Account>,
    pub grades: Vec<CandidateGrade>,
    pub replacing_vote_id: Option<u64>,
}

pub struct MajorityJudgmentVoterEntry {
    pub vote_id: u64,
    pub grades: Vec<CandidateGrade>,
}
```

A valid ballot must:

- contain exactly one entry for every candidate;
- contain no duplicate candidate ID;
- contain no unknown candidate ID; and
- use one of the five `Grade` variants for every candidate.

The component normalizes ballot entries into candidate-ID order before storage and event emission. This makes equality, replay, and off-chain decoding independent of the order supplied by the wallet manifest.

### Rounds

```rust
pub enum MajorityJudgmentRoundId {
    RoundOne,
    Rerun,
}

pub struct MajorityJudgmentRound {
    pub snapshot: Instant,
    pub start: Instant,
    pub deadline: Instant,
    pub quorum: Decimal,
    pub minimum_median_grade: Grade,
    pub voters: KeyValueStore<Global<Account>, MajorityJudgmentVoterEntry>,
    pub votes: KeyValueStore<u64, MajorityJudgmentVoteRecord>,
    pub vote_count: u64,
    pub revote_count: u64,
}
```

Round 1 is created with the election. The rerun is `None` until explicitly initiated:

```rust
pub struct MajorityJudgmentElection {
    pub temperature_check_id: u64,
    pub title: String,
    pub short_description: String,
    pub description: String,
    pub links: Vec<Url>,
    pub author: Global<Account>,
    pub role_id: String,
    pub seat_count: u32,
    pub candidates: Vec<MajorityJudgmentCandidate>,
    pub parameter_set: GovernanceParameterSetSnapshot,
    pub review_start: Instant,
    pub review_end: Instant,
    pub round_one: MajorityJudgmentRound,
    pub rerun: Option<MajorityJudgmentRound>,
    pub tie_resolution: Option<MajorityJudgmentTieResolution>,
    pub hidden: bool,
}
```

The component does not store derived `PENDING`, `LIVE`, or `FINAL` status. Time-based phase is derived from the stored instants; quorum, ranking, and terminal status are collector results.

### Component state

Extend the post-Phase-1 component state:

```rust
struct Governance {
    pub parameter_sets: KeyValueStore<String, GovernanceParameterSet>,
    pub temperature_checks: KeyValueStore<u64, TemperatureCheck>,
    pub temperature_check_count: u64,
    pub proposals: KeyValueStore<u64, Proposal>,
    pub proposal_count: u64,
    pub majority_judgment_elections: KeyValueStore<u64, MajorityJudgmentElection>,
    pub majority_judgment_election_count: u64,
}
```

Nested round voter/vote KVS addresses remain discoverable through the decoded election record. No separate on-ledger vector of election IDs is required; Gateway KVS enumeration supplies list views.

## Scrypto Methods and Authorization

Use only the existing `owner` role.

Public methods:

```rust
make_temperature_check(...)
vote_on_temperature_check(...)
vote_on_proposal(...)
vote_on_majority_judgment_election(
    account: Global<Account>,
    election_id: u64,
    round: MajorityJudgmentRoundId,
    grades: Vec<CandidateGrade>,
)
get_majority_judgment_election_count() -> u64
```

Owner-only methods:

```rust
make_proposal(temperature_check_id: u64) -> u64
make_majority_judgment_election(
    temperature_check_id: u64,
    review_start: Instant,
    candidate_order: Vec<MajorityJudgmentCandidateId>,
) -> u64
start_majority_judgment_rerun(
    election_id: u64,
    voting_start: Instant,
)
record_majority_judgment_tie_resolution(
    election_id: u64,
    round: MajorityJudgmentRoundId,
    ordered_candidate_ids: Vec<MajorityJudgmentCandidateId>,
)
toggle_majority_judgment_election_hidden(election_id: u64)
```

Add the methods to `enable_method_auth!`, component royalties, and the public schema. Do not add `election_manager`, `parameter_manager`, or any other role.

Formal creation remains owner-only because it is the same operational elevation boundary as `make_proposal`. This does not prevent public election TCs: any account can create a TC with an active MJ profile, while the Governance Operator has the framework duty to elevate an eligible passed TC.

## Election Creation Semantics

`make_majority_judgment_election` must:

1. Load the TC and reject a missing TC or an existing continuation.
2. Require the TC deadline to have elapsed. The component cannot determine the official off-chain result, so the owner call represents the Governance Operator's verification that the TC passed.
3. Require an MJ profile snapshot and MJ follow-up data.
4. Validate `review_start >= now` and the candidate-order permutation.
5. Copy title, descriptions, links, author, role, seats, candidates, and the full parameter snapshot from the TC.
6. Set the Round 1 snapshot to the TC's stored `start` instant.
7. Derive `review_end`, `round_one.start`, and `round_one.deadline` from the snapshotted exact durations using checked timestamp arithmetic.
8. Create fresh Round 1 voter and vote KVS stores.
9. Store `ConsultationContinuation::MajorityJudgmentElection(id)` on the TC.
10. Emit the creation event.

`round_one.start` equals `review_end`. There is no manual promotion between candidate review and Round 1 voting.

The copied candidate commitment means the owner can schedule and shuffle the formal election but cannot replace the candidates the community saw during the TC.

## Voting Semantics

`vote_on_majority_judgment_election` must:

1. Assert the voting account's owner rule, matching the current TC/GP ownership check.
2. Resolve the explicitly requested round and reject a nonexistent rerun.
3. Require `now >= round.start` and `now < round.deadline`.
4. Validate and normalize the complete ballot.
5. Look up the existing voter entry in that round only.
6. Allocate the next round-local vote ID.
7. Store the new record, including `replacing_vote_id` for a revote.
8. Replace the account's voter entry and increment the revote counter when applicable.
9. Emit a round-specific event containing the normalized ballot.

Round 1 and rerun ballots never replace each other. A voter may cast one current ballot per round and may revise it until that round closes.

The Scrypto method does not query account balances or reject zero snapshot power. The collector resolves the snapshot balance and excludes a zero-power ballot from persistence and tallying.

## Rerun Semantics

The component cannot know whether fixed quorum was met because voting power is calculated off-chain. Starting a rerun is therefore an owner-authorized action based on the collector result and RAC publication process.

`start_majority_judgment_rerun` must:

- require Round 1 to have ended;
- require no existing rerun;
- require `voting_start >= now`;
- take a fresh snapshot instant of `now`;
- use the snapshotted `rerun_quorum`, `rerun_minimum_median_grade`, and `rerun_voting_days` from the election profile;
- create new voter and vote KVS stores; and
- emit the exact snapshot, start, deadline, fixed XRD quorum, and grade floor.

The RAC must keep both normal and rerun fixed-XRD quorum values current before the TC is created. A parameter edit after TC creation cannot alter the election's rerun rule.

No third round can be created.

## Unresolved Tie Recording

The calculation is deterministic for ordinary ties. A true `TIE_UNRESOLVED` result requires the governance-defined adjudication described in the adopted MJ policy.

To close the technical lifecycle without creating an unaudited database edit, provide one owner-only on-ledger recording method. It stores:

```rust
pub struct MajorityJudgmentTieResolution {
    pub round: MajorityJudgmentRoundId,
    pub ordered_candidate_ids: Vec<MajorityJudgmentCandidateId>,
    pub recorded_at: Instant,
}
```

The method must require the relevant round to have ended, accept only known unique candidates, and permit only one resolution record. The component cannot independently prove which candidates were tied. The collector validates the supplied order against its unresolved tied group before applying it.

This method records a RAC determination already made under the adopted governance process; it does not grant the component owner a general election-deciding power. If the governance framework chooses a runoff or another process instead of RAC ordering, replace this method in the plan before implementation.

## Scrypto Events

Add typed events:

```rust
MajorityJudgmentElectionCreatedEvent
MajorityJudgmentElectionVotedEvent
MajorityJudgmentRerunStartedEvent
MajorityJudgmentTieResolutionRecordedEvent
MajorityJudgmentElectionHiddenToggledEvent
```

Required event fields:

| Event | Minimum payload |
|---|---|
| Created | election ID, TC ID, role ID, seat count, review start/end, Round 1 snapshot/start/deadline, profile ID/version |
| Voted | election ID, round ID, vote ID, account, normalized candidate grades, replaced vote ID |
| Rerun started | election ID, snapshot/start/deadline, fixed XRD quorum, minimum median grade |
| Tie resolution | election ID, round ID, ordered candidate IDs, recorded time |
| Hidden toggled | election ID and new hidden value |

The collector must identify custom events using component emitter plus event name and then decode the full payload with the shared SBOR schema. It must not trust positional field extraction alone.

## On-Ledger Validation Matrix

| Input | Rule |
|---|---|
| Profile label and IDs | Non-empty after trimming |
| Profile variant update | Existing variant must not change |
| Duration | Non-zero; timestamp addition must succeed; no additional day maximum |
| Fixed quorum | `> 0` |
| Approval threshold | Greater than `0` and at most `1` |
| Rerun quorum | `> 0` and lower than the Round 1 quorum |
| Rerun grade floor | Strictly higher than the Round 1 grade floor |
| Role ID | Non-empty |
| Candidate count | 2–20 |
| Candidate reference/display name | Non-empty |
| Candidate reference | Unique within the TC/election |
| Candidate links | Valid URLs; at most 5 per candidate and within the existing consultation-wide payload bounds |
| Seat count | `>= 1` and `< candidate_count` |
| Candidate order | Exact permutation of committed candidate IDs |
| Election creation | TC ended, not continued, matching MJ variants |
| Vote | Requested round exists and is open |
| Ballot | Exactly one valid grade per candidate |
| Rerun | Round 1 ended and no rerun exists |
| Tie resolution | Round ended, known unique candidates, not previously recorded |

## Off-Chain Calculation Model

### Fixed voting power snapshot

For each round, resolve the stored snapshot `Instant` to one Gateway state version and use that same state version for every account balance source.

Reuse `VotePowerSnapshot` and `getVotePowerConfig`:

- Round 1 uses `election.round_one.snapshot`, inherited from TC creation.
- The rerun uses `election.rerun.snapshot`, recorded when the rerun is initiated.
- First-time voters are snapshotted in batches.
- A revoter reuses the voting power already stored for that account in that round.
- Accounts whose computed voting power is zero are omitted from `mj_account_ballot`, histograms, total power, and result calculations.

Quorum is met when:

```text
total valid ballot voting power >= round fixed XRD quorum
```

Do not fetch, store, or divide by an `eligibleVotingPower` denominator. The UI displays current XRD-equivalent participation against the fixed required amount.

### Weighted grade histogram

Each valid account ballot contributes its full round snapshot voting power to exactly one grade bucket for every candidate.

For candidate `c` and grade `g`:

```text
histogram[c][g] = sum(voter voting power where ballot[c] == g)
```

Because partial ballots are rejected, the sum across all grades is the same for every candidate and equals total valid ballot voting power.

### Majority grade

For each candidate:

1. Traverse grades from Excellent to Poor.
2. Accumulate the exact decimal voting power.
3. Select the first grade where `2 * cumulative >= total`.

The multiplication form avoids division and midpoint rounding. When total power is zero, the candidate has no majority grade and cannot be ranked or elected.

### Electability and seating

1. Mark a candidate electable only when their majority grade is at least the round's minimum median grade.
2. Rank electable candidates by majority grade descending, applying the deterministic tie procedure where the tie affects the seat boundary.
3. Seat the first `seat_count` electable candidates.
4. Record `referred_seats = seat_count - seated_count`.
5. Put remaining electable candidates on the reserve list in calculated order.
6. Record reserve-list expiry from the snapshotted `reserve_list_days`.

The collector records the result. KYC, willingness to serve, concurrent-role limits, and actual legal seating remain outside Consultation V2.

### Deterministic tie procedure

Follow the adopted interpretation of the framework instruction to remove a median-grade ballot from each tied candidate in turn.

For a tied group affecting the seat boundary:

1. Create a candidate-local in-memory copy of ballot contributions. Never mutate persisted ballots or histograms.
2. Sort tied candidates by candidate ID for stable iteration.
3. For each tied candidate, select a contribution whose grade equals that candidate's current majority grade using this total order:
   - voting power ascending;
   - account address lexicographically ascending;
   - vote ID ascending.
4. Remove that contribution from that candidate's working distribution only.
5. Recompute all tied candidates after the full iteration cycle.
6. Repeat until the seat-boundary order changes or no qualifying contribution remains.

Candidate-ID ordering is only an execution order; it is not itself a tie winner. A tie that remains after all applicable contributions are exhausted becomes `TIE_UNRESOLVED`.

Persist:

- whether a tie-break was used;
- the number of iterations;
- the final working majority grade used for ordering; and
- the unresolved candidate group when applicable.

Debug logs include the same information but never include wallet secrets or unrelated account data.

### Round and election status

The persisted election status is:

| Status | Meaning |
|---|---|
| `PENDING` | Election created; candidate review has not opened. |
| `REVIEW_OPEN` | Candidate review open; no MJ ballots accepted. |
| `LIVE` | Round 1 open. |
| `RERUN_PENDING` | Round 1 ended below quorum; rerun not started or scheduled for the future. |
| `RERUN_LIVE` | Rerun open. |
| `FINAL` | A round met quorum and produced a resolved seating order. |
| `TIE_UNRESOLVED` | Quorum met, but a consequential tie awaits the adopted resolution process. |
| `FAILED` | The rerun ended below its fixed quorum. No candidate is elected. |

Round 1 at or above quorum never proceeds to a rerun, even if no candidate clears the grade floor. That is a valid election with unfilled seats referred to the policy's vacancy/founding-election process.

When Round 1 closes below quorum, status becomes `RERUN_PENDING`. The owner starts the rerun after publishing the required notice. When the rerun closes below its fixed quorum, status becomes `FAILED` and all seats are referred.

## Collector Architecture

Add three focused Effect services rather than expanding `VoteCalculation` into a tagged function with unrelated result shapes:

```text
MajorityJudgmentProjection
  projects creation/rerun/tie-resolution events and on-ledger entity state

MajorityJudgmentCalculation
  ingests new round votes, updates ballots/histograms, and computes live results

MajorityJudgmentFinalizer
  closes due rounds even when no transaction arrives at the deadline
```

Each is an `Effect.Service` following current layer composition. Business operations should be named `Effect.fn` functions. Gateway, database, and snapshot failures remain typed until the outer polling boundary logs/retries them.

### Event routing

Refactor the governance event processor output into a tagged union that distinguishes existing standard calculation payloads from MJ actions:

```text
StandardVotesChanged
MajorityJudgmentCreated
MajorityJudgmentVotesChanged
MajorityJudgmentRerunStarted
MajorityJudgmentTieResolutionRecorded
```

For an MJ event, synchronize the authoritative election/round KVS record before calculating. Deduplicate actions by `(election_id, round)` within one transaction page, keeping the latest vote count.

The ledger cursor advances only after projection and calculation commits succeed. Replaying the page before cursor advancement must be harmless.

### Vote ingestion and revotes

For each `(election, round)` calculation:

1. Read the round's persisted `last_vote_count`.
2. Fetch indexed KVS vote records from that count through the on-ledger round vote count at one stable ledger state.
3. Deduplicate the fetched slice by account, keeping the greatest vote ID.
4. Load existing ballot rows for those accounts.
5. Snapshot only first-time accounts at the round snapshot state version.
6. Drop zero-power first-time ballots.
7. In one SQL transaction:
   - subtract each replaced ballot's old contributions;
   - upsert the normalized new ballot and voting power;
   - add its new histogram contributions;
   - recompute and upsert the current result;
   - update `last_vote_count`.

The transaction prevents a revote from leaving a histogram with both the old and new contribution. Histogram values must never become negative; a negative value is an invariant failure and stops cursor advancement.

### Deadline finalization

The current collector recalculates only after vote events. That is insufficient for time-based status transitions because no transaction is guaranteed at a round deadline.

After the transaction stream is drained on every scheduled poll, `MajorityJudgmentFinalizer` must:

1. Query projected non-terminal elections whose review or round boundary has elapsed.
2. Derive `PENDING`, `REVIEW_OPEN`, and live status from current time.
3. Recompute a due round from persisted ballots/histograms under a database lock.
4. Mark Round 1 below quorum as `RERUN_PENDING`.
5. Mark a resolved quorum-met round `FINAL`.
6. Mark a consequential unresolved tie `TIE_UNRESOLVED`.
7. Mark a below-quorum rerun `FAILED`.

Finalization must be idempotent. A second worker or retry sees the already committed state and performs no semantic change. The existing poll lock remains the primary scheduler exclusion, while row-level transaction checks protect against operational overlap.

### Tie-resolution projection

When a tie-resolution event arrives:

1. Require the current result to be `TIE_UNRESOLVED`.
2. Recompute the unresolved group from persisted ballots.
3. Verify the recorded candidate order contains exactly that group.
4. Apply the order only to that group.
5. Recompute seating/reserve output and set `FINAL`.

A mismatched record is an invariant error requiring operator review; the collector must not silently accept it.

### Operational properties

- **Determinism:** the same normalized ballots and voting powers must produce byte-for-byte equivalent domain results regardless of database insertion order.
- **Idempotency:** replaying projected events or rerunning finalization must not change the semantic result.
- **Performance:** after voting powers are available, applying a vote/revote batch and recalculating an election with 20 candidates and 10,000 stored ballots should complete within 2 seconds on the representative collector/database environment. Benchmark this separately from Gateway snapshot latency.
- **Auditability:** DEBUG logs record round identity, histogram totals, majority grades, grade-floor decisions, tie iterations, quorum classification, seating, reserves, and referrals. Logs must not be the only source of result data.
- **Atomicity:** ballot, histogram, result, and round vote-count cursor changes commit or roll back together.

## Database Design

Extend `packages/database/src/schema.ts` and generate one Drizzle migration. Use the repository's existing Drizzle migration runner. Do not introduce a second migration system.

### `mj_election`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | Component-scoped election ID |
| `temperature_check_id` | integer unique | One formal continuation per TC |
| `role_id` | varchar | Stable same-role/reserve key |
| `title` | text | Projected from ledger |
| `short_description` | text | Projected from ledger |
| `description` | text | Projected from ledger |
| `seat_count` | integer | |
| `review_start` | timestamptz | |
| `review_end` | timestamptz | |
| `parameter_set_id` | varchar | Snapshotted identity |
| `parameter_set_version` | integer | Snapshotted version |
| `reserve_list_days` | integer | Snapshotted rule |
| `status` | varchar | Validated application status |
| `hidden` | boolean | Projected flag |
| `created_at` | timestamptz | Ledger-derived time |

### `mj_candidate`

| Column | Type | Notes |
|---|---|---|
| `election_id` | integer FK | Composite PK |
| `candidate_id` | integer | Composite PK |
| `reference` | varchar | Unique with election ID |
| `display_name` | text | |
| `description` | text | |
| `links` | jsonb | Validated string array |
| `display_order` | integer | Unique with election ID |

### `mj_round`

| Column | Type | Notes |
|---|---|---|
| `election_id` | integer FK | Composite PK |
| `round` | smallint | `1` or `2`; composite PK |
| `snapshot_at` | timestamptz | Ledger instant used for power |
| `snapshot_state_version` | bigint nullable | Filled when resolved once |
| `voting_start` | timestamptz | |
| `voting_end` | timestamptz | |
| `quorum_xrd` | numeric | Fixed on-ledger amount |
| `minimum_median_grade` | smallint | `0..=4` |
| `votes_kvs_address` | varchar | Round vote record store |
| `voters_kvs_address` | varchar | Current ballot lookup store |
| `last_vote_count` | bigint | Collector cursor for this round |
| `status` | varchar | Round projection status |

### `mj_account_ballot`

| Column | Type | Notes |
|---|---|---|
| `election_id` | integer | Composite PK |
| `round` | smallint | Composite PK |
| `account_address` | varchar | Composite PK |
| `vote_id` | bigint | Latest on-ledger vote ID |
| `grades` | jsonb | Validated candidate/grade array |
| `voting_power` | numeric | Fixed at round snapshot |
| `cast_at` | timestamptz | Ledger event time |

### `mj_grade_histogram`

| Column | Type | Notes |
|---|---|---|
| `election_id` | integer | Composite PK |
| `round` | smallint | Composite PK |
| `candidate_id` | integer | Composite PK |
| `grade` | smallint | Composite PK, `0..=4` |
| `voting_power` | numeric | Non-negative total |

### `mj_result`

| Column | Type | Notes |
|---|---|---|
| `election_id` | integer | Composite PK |
| `round` | smallint | Composite PK; one current/terminal row |
| `computed_at` | timestamptz | |
| `total_voting_power` | numeric | Sum of valid ballot power |
| `quorum_xrd` | numeric | Fixed threshold applied |
| `quorum_met` | boolean | |
| `minimum_median_grade` | smallint | Applied floor |
| `candidate_results` | jsonb | Schema-decoded result array |
| `seated_candidate_ids` | jsonb | Ordered IDs |
| `reserve_candidate_ids` | jsonb | Ordered IDs |
| `reserve_expires_at` | timestamptz nullable | Set on final result |
| `referred_seats` | integer | |
| `tie_break_iterations` | integer | Audit field |
| `unresolved_candidate_ids` | jsonb | Empty unless unresolved |
| `status` | varchar | Live/terminal result status |

Use database constraints for round, grade, seat/referral non-negativity, uniqueness, and foreign keys. Keep decimal values as strings/`BigNumber` at TypeScript boundaries; do not convert voting power to JavaScript `number`.

There is no result-version or history table. Live rows are updated. `FINAL` and `FAILED` rows are immutable. `TIE_UNRESOLVED` is non-terminal and may transition once to `FINAL` after the recorded resolution.

## Shared Package and Gateway Reads

Add named reusable Effect Schema models and SBOR schemas in `packages/shared`:

- branded `MajorityJudgmentElectionId` and `MajorityJudgmentCandidateId` numeric types;
- `Grade`, `MajorityJudgmentRoundId`, and status tagged/literal schemas;
- parameter payload union and snapshots;
- TC follow-up/continuation union;
- candidate, round, election, voter-entry, vote-record, and event SBOR decoders;
- normalized ballot and result response schemas; and
- typed manifest input schemas.

Use Effect Schema, not Zod. Prefer named `Schema.Class`/tagged models for reusable domain values and tagged variants. Decode unknown Gateway, database JSON, and HTTP data at their boundaries. New code must not use `any`, unchecked `as` assertions, or unvalidated positional event payloads.

Extend `GovernanceComponent` with:

```text
getMajorityJudgmentElections
getMajorityJudgmentElectionById
getMajorityJudgmentVotesByIndex
getMajorityJudgmentVoterEntriesByAccounts
makeMajorityJudgmentElectionManifest
makeMajorityJudgmentVoteManifest
startMajorityJudgmentRerunManifest
recordMajorityJudgmentTieResolutionManifest
makeToggleMajorityJudgmentElectionHiddenManifest
```

For list enumeration, drain all KVS key pages and fetch all values at one `at_ledger_state`. For direct ID/account reads, use `KeyValueStoreDataService` with explicit keys. Tests must cover empty stores, multiple key pages, chunked data requests, missing records, and stable ledger state.

Manifest helpers must escape/encode user-controlled strings using the repository's established manifest-safe approach. Do not build an MJ candidate/description manifest through raw interpolation without boundary validation.

## Result API

Add one read endpoint in both local Hono and Lambda/SST surfaces:

```text
GET /majority-judgment-election?electionId=<id>
```

Return a shared schema-decoded response containing:

```text
election projection
candidate list in display order
current round metadata
current derived status
optional current/terminal result
```

Before voting opens or while a rerun is pending, `result` is absent and no histograms are returned. During live voting it is explicitly provisional. Terminal output includes fixed quorum, total participation, grade floor, candidate histograms, electability, ranks, seats, reserves, referrals, tie disclosure, and rerun disclosure.

The endpoint reads persisted projection/result data. It does not perform Gateway balance calls or recalculate a result during an HTTP request.

Add the route to:

- `apps/vote-collector/src/http-server.ts`;
- `apps/vote-collector/src/handlers.ts`;
- `apps/vote-collector/src/layers.ts`; and
- `apps/vote-collector/sst.config.ts`.

The frontend HTTP client must import the shared response schema instead of defining a duplicate local response model.

## Frontend Plan

### Creating an election TC

Extend the Phase 1 parameter dropdown on `/tc/new`:

- Standard profile: show the existing formal-proposal option fields.
- MJ profile: show role ID, seat count, and a repeatable candidate editor with reference, name, profile text, and links.
- Always show the selected profile's exact TC duration, fixed XRD quorum, and approval threshold before signing.
- Explain that the candidate list is committed by the TC and cannot be replaced during formal elevation.

The form submits the one public `make_temperature_check` method with the tagged follow-up variant.

### Elevation from the TC page

Replace the standard-only promotion panel with a continuation-aware component:

- Standard TC: `Create Governance Proposal`.
- MJ TC: `Create Majority Judgment Election`.
- Existing continuation: link to the created proposal or election.

For an MJ TC, the owner form selects `review_start` and generates a secure shuffled candidate-ID permutation. It displays the resulting order for confirmation before transaction submission.

### Election route

Add:

```text
apps/consultation/src/routes/election/$id/
```

The same `/election/$id` route covers review, Round 1, rerun, and final result.

Include non-hidden elections in the existing consultation list/navigation so a user does not need to know the route ID in advance.

Required sections:

- election title, role, seats, TC origin, profile identity/version, and schedule;
- candidate cards in immutable display order;
- status banner and countdown;
- complete grade form during an open round;
- fixed XRD quorum progress;
- provisional/live or official result section as applicable; and
- owner-only rerun/tie/visibility controls when applicable.

### Grade form

- Reuse `ConnectButton`, `AccountSelector`, `SendTransaction`, and existing transaction toasts.
- Render all five grades in governance order for every candidate.
- Disable submission until every candidate has exactly one grade.
- Show the number of candidates still ungraded.
- Disable inputs outside an open round or while a transaction is pending.
- Read existing voter entries from the active round KVS and prefill a previously submitted ballot.
- Allow resubmission until the deadline and clearly label it as replacing the earlier ballot.
- Refresh the voter entry after commit; allow for the collector's polling delay before provisional results change.

If multiple accounts are selected, the same complete ballot may be submitted using the current batch transaction pattern. Mixed existing ballots must be shown as mixed rather than silently choosing one account's values.

### Candidate review

During `REVIEW_OPEN`:

- show the complete candidate profiles and voting start countdown;
- render grade controls disabled so the upcoming interaction is understandable;
- show no histograms, ranks, or turnout; and
- label the phase as review, distinct from the earlier nomination/discussion window.

### Results

During live rounds, label every result provisional. For each candidate display:

- majority-grade label;
- five-bucket weighted histogram;
- provisional or final rank;
- grade-floor comparison;
- seated, reserve, or not-electable state; and
- tie-break disclosure where applicable.

Show participation as:

```text
<current valid XRD-equivalent voting power> / <fixed quorum XRD-equivalent>
```

Do not display an eligible-supply percentage calculated by the application.

Statuses must distinguish candidate review, normal voting, rerun pending/live, final, unresolved tie, and failed rerun. A failed or partially filled election links the user to the applicable vacancy/founding-election policy explanation; Consultation V2 does not itself seat replacements.

## Governance and Operational Workflow

### Before installing an MJ profile

1. Adopt the MJ governance amendments.
2. Publish the exact standard and rerun fixed-XRD quorum amounts and how the RAC derived them.
3. Deploy the coordinated component/shared/collector/database/UI version.
4. Add the approved MJ profile through the existing owner role.
5. Verify the Gateway exposes and decodes the tagged profile at one ledger state.

### Normal election

1. Complete the off-chain Nomination and Discussion Window.
2. A community account creates an MJ election TC containing the final candidates and selected profile.
3. The community votes on the TC.
4. After an eligible passed result, the owner creates the MJ election, selecting review start and ballot order.
5. Candidate review and Round 1 open according to stored times.
6. The collector finalizes Round 1 after its deadline.
7. The RAC publishes the official result within the governance publication window.

### Low-turnout rerun

1. The finalizer records `RERUN_PENDING` after Round 1 misses fixed quorum.
2. The RAC publishes the reduced-quorum/raised-grade notice.
3. The owner initiates the rerun with its start time.
4. The component records a fresh snapshot and the snapshotted rerun rules.
5. The collector tallies and finalizes the rerun independently from Round 1.

### Unresolved tie

1. The collector records `TIE_UNRESOLVED` and the exact group.
2. The adopted governance process resolves the tie.
3. The owner records that determination on-ledger.
4. The collector verifies it against the calculated group and transitions the result to `FINAL`.

## Pre-Launch Deployment

There is no in-place component migration or historical preservation requirement.

Deploy in this order:

1. Finalize and adopt the governance amendments.
2. Implement and test the named parameter registry.
3. Implement MJ Scrypto and redeploy a fresh package/component.
4. Generate/update the SBOR schemas and component addresses.
5. Add the database tables with one normal schema migration or provision a fresh pre-launch database.
6. Deploy the collector/API against the new component and database schema.
7. Deploy the UI and install approved Standard and MJ profiles.
8. Run a Stokenet smoke test and record component/KVS/event identifiers.
9. Update the Operating Agreement's governance-mechanism technical identifiers when required by the adopted framework.

Remove obsolete singleton schemas/methods and old component configuration in the same release. Do not retain dual readers for the unused pre-launch component.

## Test Plan

### Scrypto simulator tests

Parameter and TC foundation:

- tagged Standard/MJ profile add, update, retirement, and snapshot decoding;
- reject changing an existing profile's variant;
- reserved `default` remains active and Standard;
- public account can create an MJ TC with an active MJ profile;
- reject mismatched profile/follow-up variants;
- validate candidate uniqueness/count, seats, grade floors, quora, and durations;
- retirement/edit after TC creation does not change the TC or election.

Formal creation and voting:

- owner can create an election only from an ended, uncontinued MJ TC;
- non-owner creation fails;
- copied candidates/role/seats/profile exactly match the TC;
- candidate order must be a complete permutation;
- Round 1 snapshot equals TC start and dates derive correctly;
- voting fails during review, at/after deadline, for the wrong/nonexistent round, or without account proof;
- partial, duplicate, and unknown-candidate ballots fail;
- complete ballot succeeds and is normalized;
- revote records `replacing_vote_id` and leaves one voter entry;
- Round 1 and rerun voter/vote stores are independent.

Rerun and tie record:

- only owner can start a rerun;
- rerun cannot start before Round 1 ends or more than once;
- rerun snapshot is initiation time and uses snapshotted rerun rules;
- only one valid tie-resolution record can be stored after round close;
- invalid candidate order in a tie resolution fails;
- every event has the expected emitter, name, and payload.

### Pure calculation tests

- each possible median grade;
- exact-half boundary uses `>=`;
- weighted voters with widely different power;
- zero total produces no median;
- minimum-grade pass/fail boundary;
- single-seat and multi-seat ranking;
- insufficient electable candidates and referred seats;
- reserve ordering and expiry;
- one-cycle and multi-cycle tie resolution;
- equal voting-power selection uses account/vote-ID ordering;
- unresolved tie;
- fixed quorum immediately below, equal to, and above threshold;
- Round 1 below quorum requests rerun;
- rerun applies raised grade floor and reduced fixed quorum;
- rerun below quorum fails;
- output is identical for every input insertion order.

### Collector/database tests

Use `@effect/vitest` layer tests and the existing PostgreSQL test container pattern:

- project creation, candidates, Round 1, rerun, and tie events idempotently;
- retrieve all new KVS votes from the correct inclusive indices;
- snapshot first-time voters at the stored round state version;
- exclude zero-power voters;
- atomically subtract/add all candidate-grade contributions on revote;
- replay the same event page without changing ballots/histograms/results;
- never mix Round 1 and rerun power or ballots;
- do not advance the ledger cursor on projection/calculation failure;
- finalize a round after time elapses with no new ledger transaction;
- concurrent/repeated finalization is idempotent;
- terminal rows reject further live updates;
- tie-resolution event must match the calculated unresolved group;
- API returns no tally before voting, provisional tally live, and immutable terminal result after close.

### Shared/Gateway tests

- decode every new component, KVS, enum, option, and event shape;
- fail with a typed parse error on malformed payloads;
- list enumeration drains multiple pages at one ledger state;
- direct election/voter lookups encode keys correctly;
- vote manifests encode every candidate/grade and round correctly;
- manifest input schemas reject incomplete/duplicate ballots before wallet submission;
- creation, rerun, tie-resolution, and hidden-toggle manifests use existing owner proof conventions.

### Frontend tests

- profile variant switches the TC form fields;
- MJ candidate editor enforces 2–20 candidates and valid seat count;
- review phase shows candidates, disables grades, and hides tallies;
- submit stays disabled until all candidates are graded;
- prior active-round ballot pre-fills and can be replaced;
- pending transaction prevents duplicate submission;
- fixed-XRD quorum progress renders correctly;
- live results are labelled provisional;
- rerun and raised-grade disclosures render;
- unresolved/failed/final states render the correct action and explanation;
- continuation-aware TC elevation links to the created election.

### End-to-end verification

- deploy a fresh component with Standard and test MJ profiles;
- create an MJ TC permissionlessly;
- elevate it with the existing owner badge;
- submit complete ballots and a revote from multiple accounts;
- verify events, KVS records, database rows, API output, and UI agree;
- exercise time boundaries and rerun locally with `LedgerSimulator` clock control;
- verify a Stokenet creation/vote read path against the real Gateway;
- compare a published deterministic fixture tally with an independent implementation.

## Implementation Sequence

1. **Governance alignment** — amend the pending framework/parameters and settle the unresolved-tie process.
2. **Scrypto foundation** — tag parameter profiles, commit typed TC follow-ups, add MJ entity/rounds/methods/events, and complete simulator tests.
3. **Shared ledger boundary** — add Effect/SBOR schemas, Gateway readers, manifest builders, and boundary tests.
4. **Persistence and calculation** — add Drizzle tables/migration, the pure calculator, projection, vote ingestion, finalizer, and integration tests.
5. **API and UI** — add the result endpoint/client, TC variant form/elevation, election route, grade form, results, and component tests.
6. **Coordinated pre-launch rollout** — fresh component/database configuration, profile installation, Stokenet verification, and identifier documentation.

At the end of each step, run the smallest owning test suite before proceeding to the next layer. Do not defer Scrypto ballot invariants or pure tie/quorum tests to an end-to-end test.

## Acceptance Criteria

- A public account can create an election TC using an active MJ profile without an RAC badge.
- The candidate set, role, seats, and parameters seen during the TC cannot be replaced during formal election creation.
- A passed election TC can create exactly one MJ election and cannot create a standard proposal.
- Review and both voting rounds enforce their on-ledger time windows.
- Every accepted ballot grades every candidate exactly once and supports round-local revoting.
- The collector uses the correct stored snapshot for each round and excludes zero-power accounts.
- Quorum is evaluated only against the snapshotted fixed XRD amount; the component does not calculate eligible supply.
- Weighted medians, grade floor, ranking, seating, reserve, referral, and tie behavior are deterministic and independently testable.
- Round closure occurs even when no vote/event arrives at the deadline.
- A rerun can occur only once, uses a fresh voter-power snapshot, and applies the snapshotted reduced quorum and raised grade floor.
- An unresolved tie cannot silently become final; its governance resolution is recorded on-ledger and verified by the collector.
- Replaying ledger events does not change the resulting ballots, histograms, or result.
- Live results are explicitly provisional; final/failed results are immutable.
- Standard TC/GP behavior remains correct in the new coordinated schema, without maintaining compatibility with the unused pre-launch component.
- The deployed MJ process matches the governance documents ratified for the election.

## Out of Scope

- Implementing or preserving the interim two-stage Approval Voting/confirmation election process.
- Candidate self-nomination or forum workflow; the final nomination output is supplied when the election TC is created.
- KYC, candidate willingness confirmation, role-concentration checks, or legal seating.
- Automating the RAC's public result notice.
- Automatically initiating a rerun without the existing owner-authorized governance-operation step.
- Calculating total eligible/circulating XRD supply or percentage quorum in Scrypto or the collector.
- Delegation changes.
- Weighted Allocation voting.
- Historical import, compatibility readers, or a historical result-version browser.
- Trustless/verifiable random entropy for ballot display ordering.

## Estimate

Assuming the named parameter registry is implemented first and one engineer is familiar with the repository:

| Workstream | Estimate |
|---|---:|
| Scrypto model, methods, events, simulator tests | 4–6 days |
| Shared schemas, Gateway reads, manifests | 2–3 days |
| Database, calculator, projection, finalizer, API | 5–8 days |
| TC/election UI and component tests | 4–6 days |
| Integration, Stokenet, audit fixtures, rollout | 2–4 days |
| **Total engineering** | **17–27 working days** |

Governance-document amendment and review time is separate. The largest uncertainty is the adopted tie-resolution process; it must be settled before the related Scrypto method and terminal result workflow are implemented.

## Reviewer Checklist

The third-party review should answer these questions explicitly:

1. Does the tagged parameter/TC continuation design cleanly prevent Standard and MJ elevation paths from being confused while preserving permissionless TC creation?
2. Are the proposed nested round KVS ownership, manifest/SBOR derives, mutable access patterns, and method signatures valid for Scrypto `1.3.1`?
3. Can every complete-ballot, time-window, revote, rerun, and continuation invariant be enforced on-ledger as described?
4. Does the fixed-XRD design consistently remove eligible-supply percentage calculations from the component, collector, database, API, and UI?
5. Is the weighted median and candidate-local tie procedure a faithful deterministic implementation of the adopted governance wording?
6. Does the event projection remain idempotent across transaction-page replay, multiple votes per page, and round transitions?
7. Does the SQL transaction make a revote atomic across ballot, histogram, result, and vote-count cursor updates?
8. Can the finalizer close due rounds safely with no new ledger event and under repeated/concurrent execution?
9. Is the on-ledger tie-resolution record sufficient and appropriately constrained by the adopted governance process, or should governance require a runoff instead?
10. Do the Effect Schema boundaries eliminate unvalidated event/database/API JSON and avoid parallel duplicated domain schemas?
11. Does the pre-launch rollout remove the need for legacy compatibility/data-migration code without leaving any client on the old component schema?
12. Are all governance prerequisites satisfied before an MJ profile is installed or used for GP-ELECT-1?
