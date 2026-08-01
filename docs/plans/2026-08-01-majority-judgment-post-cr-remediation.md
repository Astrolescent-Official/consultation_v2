# Majority Judgment post-CR remediation

**Status:** authoritative implementation record  
**Supersedes:** `2026-07-21-majority-judgment-elections-design.md`  
**Sources:** CR-001 and CR-002, raised 2026-07-29

This document records the decisions that govern the implementation after
CR-001 and CR-002. The superseded design remains useful history, but its
candidate-review phase, automatic rerun, threshold, snapshot, candidate-count,
and public-creation rules are no longer valid.

## Authoritative lifecycle

1. Nomination and discussion happen outside the Consultation App.
2. A Governance Operator creates one election operation. It atomically creates
   a normal Temperature Check and an MJ election over one immutable candidate
   list, with one creation-time voting-power snapshot.
3. The candidate-list TC is a real For/Against vote using the existing TC vote,
   KVS, and aggregation path. It is not a passive review period.
4. MJ Round 1 can open only after the TC deadline and an on-ledger outcome that
   agrees with the collector's weighted verdict: quorum met and For share at or
   above the snapshotted approval threshold.
5. A failed or contradictory TC fails closed at `TC_FAILED`; no MJ ballot opens.
6. A Round 1 quorum failure is published as `ROUND_1_FAILED` and stays there.
   The system never schedules a rerun automatically.
7. The RAC may deliberately open one Round 2 rerun. The collector accepts that
   transition only from a published `ROUND_1_FAILED` result.
8. Round 2 reuses the election-creation snapshot, Round 1 quorum, and Round 1
   minimum median grade. Its extended voting duration is the only changed rule.
9. A quorate result or recorded tie adjudication cannot be replaced by a rerun.

## Validation and calculation rules

- One or more candidates are permitted.
- `seatCount` is at least one and may be below, equal to, or above candidate
  count. The minimum median grade remains the quality gate; unfilled seats go
  to vacancy handling.
- Every MJ ballot grades every candidate exactly once.
- Majority grades, deterministic tie-breaks, seating, reserves, and vacancy
  referral follow the existing calculator rules.
- Round 1 and Round 2 quorum and grade-floor parameters must be equal. The
  contract rejects parameter sets that encode different values.
- Only one rerun is possible.
- A tie resolution is an adjudicated branch and prevents a later rerun.

## Authority boundary for weighted outcomes

Voting power is resolved off-ledger at the election snapshot, so the Scrypto
component cannot independently reproduce a weighted TC or MJ tally. The
Governance Operator records the TC outcome on-ledger, but that record is not the
public application's sole source of truth:

- the collector calculates quorum and approval from weighted votes;
- the operator UI offers only that calculated pass/fail value;
- a recorded outcome that contradicts the calculation is surfaced as an audit
  error and the election remains `TC_FAILED`;
- the finalizer requires both a recorded pass and a calculated pass;
- direct manifest submission cannot force the projection into MJ voting.

This is a deliberate fail-closed trust boundary. It does not claim that an
off-ledger weighted calculation can be verified by Scrypto.

## Read model and audit requirements

The public election response retains:

- the linked TC thresholds, weighted totals, calculated verdict, recorded
  verdict, and whether those verdicts agree;
- every projected MJ round;
- every published round result, including Round 1 after a rerun is opened;
- a separate current-round view for voting clients.

A below-quorum tally may retain deterministic candidate ordering internally for
audit purposes, but the UI must not present that ordering as an elected rank.

The D1 migration sentinel for legacy rows must be a valid positive decimal and
must fail closed. A subsequent ledger projection replaces it with the actual
snapshotted TC quorum.

## User experience requirements

- Immediately after creation, a D1 `404` means "not indexed yet", not a corrupt
  election. The page explains the state and polls until the projection appears.
- Once the TC deadline passes, the election banner says voting is closed and is
  awaiting the verified outcome; it must not show an open-vote instruction or a
  countdown frozen at zero.
- Recording an election TC outcome refreshes both the linked TC and election
  views. The indexing delay remains explicit.
- The TC list labels candidate-list gates, and election pages link back to the
  TC, so the two views cannot be mistaken for unrelated votes.
- A standard TC that passed cannot be promoted until its weighted outcome is
  recorded. The page explains that prerequisite instead of hiding the action
  without explanation.
- UI and documentation use "Governance Operator" for the governance role;
  internal authorization identifiers may retain existing names.

## Verification gates

Repository verification includes the Workerd/D1 integration suite in addition
to web/shared tests and `scrypto test` plus `scrypto build`. Address-selection
tests compare runtime configuration with the canonical network layer instead of
copying deployment addresses into assertions.

Required regression coverage includes:

- contradictory TC records fail closed;
- no automatic rerun and no transition from a quorate Round 1 result;
- equal rerun thresholds;
- Round 1 history remains available throughout Round 2;
- post-creation indexing is a recoverable client state;
- TC-closed presentation and calculated outcome controls;
- single-candidate and seats-at/above-candidate-count elections.

## Deployment constraint

Scrypto blueprints are immutable. These contract changes are not active on a
network until a new package/component is deployed and the canonical
`GovernanceConfig` address for that network is updated. A code merge alone does
not upgrade the existing Mainnet component. Deployment and address rotation are
therefore an explicit release gate, not an assumption hidden in the application.
