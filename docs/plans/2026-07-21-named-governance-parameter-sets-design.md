# Named Governance Parameter Sets

## Review Brief

This document is a proposed design for adding named governance parameter sets to the Consultations V2 dApp. It is intended to be reviewed together with the repository; no prior discussion context is required.

The reviewer should assess the design, not implement it. The review should focus on:

1. Scrypto correctness, authorization, state ownership, and snapshot invariants.
2. Gateway KVS enumeration and the TypeScript/SBOR integration boundary.
3. Pre-launch package/component deployment and coordinated Scrypto/TypeScript schema changes.
4. Missing tests, failure cases, and security or governance risks.
5. Any issue that would make the proposed implementation unsafe or infeasible.

Treat the product decisions under **Settled Product Decisions** as constraints. A reviewer may challenge one only when it creates a concrete technical, security, or governance failure.

## Product Context

Consultations V2 implements a governance flow with public Temperature Checks (TCs) followed by owner-elevated Governance Proposals (GPs). Vote power is calculated off-chain from ledger snapshots; the Scrypto component records consultations, votes, deadlines, fixed quorum amounts, and approval thresholds.

The current component supports one global six-field parameter value for every TC and GP. The DAO Charter and parameter registry define multiple non-election proposal categories with different voting durations, quora, and approval thresholds. Community members currently need RAC assistance when a consultation requires non-default parameters.

The desired outcome is:

- The component owner maintains an on-ledger registry of approved parameter sets.
- Community members select an active set while creating a TC.
- Selecting a non-default set requires no owner badge.
- Parameter changes never alter an existing TC or its future GP.
- The UI discovers available sets from ledger state through the Gateway.

The RAC is the governance body responsible for the component's owner-controlled parameter maintenance. Quorum remains a fixed XRD-equivalent amount because the component cannot reliably determine total circulating eligible voting power.

## Authoritative Inputs

- DAO policy reference: [DAO Parameters Registry, pinned revision](https://github.com/Shadaffy/radix-dao-governance/blob/39824bbf49fa372b92763ea7ce3811e502bd3ddb/pending/parameters/dao-parameters-registry.md#32-quorum-requirements).
- Scrypto version: `scrypto = 1.3.1` in `scrypto/Cargo.toml`.
- Existing behavior and repository conventions take precedence over illustrative names or pseudocode in this document.
- Election requirements are intentionally absent and will be supplied separately.

## Repository Entry Points

| Area | Files to inspect | Why it matters |
|---|---|---|
| Scrypto domain types | `scrypto/src/lib.rs` | Defines `GovernanceParameters`, TC/GP records, vote types, and events. |
| Governance blueprint | `scrypto/src/governance.rs` | Defines component state, authorization, instantiation, TC creation, GP elevation, and parameter updates. |
| Scrypto tests | `scrypto/tests/lib.rs` | Existing ledger-simulator patterns and expected manifest construction. |
| Shared ledger client | `packages/shared/src/governance/governanceComponent.ts` | Reads component/KVS state and builds transaction manifests. |
| Shared schemas | `packages/shared/src/governance/schemas.ts`, `packages/shared/src/schemas.ts` | Decodes component, TC, GP, and parameter SBOR data. |
| Consultation UI | `apps/consultation/src/atom/governanceParametersAtom.ts`, `apps/consultation/src/atom/temperatureChecksAtom.ts`, `apps/consultation/src/routes/about/-about/index.tsx`, `apps/consultation/src/routes/about/admin/-admin/index.tsx`, `apps/consultation/src/routes/tc/new/--new/`, and TC/GP detail routes | Current singleton displays/admin form, TC creation flow, and consultation detail displays. |
| Vote collector | `apps/vote-collector/src/governanceEvents.ts`, `apps/vote-collector/src/vote-calculation/`, `apps/vote-collector/scripts/tally.ts` | Vote-event processing, fixed-quorum tallying, and snapshot processing. The stale `apps/vote-collector/src/schemas.ts` file is not on the runtime import path and requires no feature work; deleting it is optional cleanup. |
| Deployment documentation | `scrypto/README.md`, `README.md` | Current package publication, component instantiation, and address configuration. |

The shared package already uses `GetKeyValueStoreService` and `KeyValueStoreDataService`, including in `packages/shared/src/governance/governanceComponent.ts`. The proposed registry read should follow those established Effect service boundaries.

## Plan Status

Design plan only. No Scrypto, TypeScript, database, or UI implementation is included in this document.

This software is being changed before launch. There is no existing consultation data or legacy reader to preserve. The Scrypto package, component, shared schemas, collector, and UI can adopt the new model together.

## Settled Product Decisions

- Parameter sets can be added, edited, and retired. They cannot be deleted.
- Existing owner authorization protects mutations; community TC creation accepts `Option<String>`, with `None` resolving to `default`.
- Quorum remains a RAC-maintained fixed XRD-equivalent `Decimal`; durations need only be greater than zero.
- The Gateway enumerates the registry KVS; the component stores no separate identifier index or registry-size cap.
- TCs and GPs store one nested immutable parameter-set snapshot. The existing flat `quorum` and `approval_threshold` fields are removed rather than duplicated.
- This is a pre-launch schema replacement; all packages adopt the new model together.
- Election parameter sets and behavior remain deferred until the separate requirements are supplied.

## Current Behavior and Problem

`scrypto/src/governance.rs` currently stores one `GovernanceParameters` value directly in `Governance` component state. `scrypto/src/lib.rs` defines it with six fields:

```rust
pub struct GovernanceParameters {
    pub temperature_check_days: u16,
    pub temperature_check_quorum: Decimal,
    pub temperature_check_approval_threshold: Decimal,
    pub proposal_length_days: u16,
    pub proposal_quorum: Decimal,
    pub proposal_approval_threshold: Decimal,
}
```

The current lifecycle is:

1. `instantiate` receives and stores one `GovernanceParameters` value.
2. `make_temperature_check` copies the singleton TC quorum and approval threshold and derives its deadline from the singleton TC duration.
3. `make_proposal` later reads the then-current singleton GP fields rather than parameters captured by the TC.
4. `update_governance_parameters` replaces the singleton without validating its values.
5. The admin UI exposes one form for editing these six singleton values.

This prevents community members from selecting the Charter-appropriate duration, fixed quorum, and approval threshold when creating a TC. The current workaround requires RAC assistance for non-default consultations.

It also creates a time-of-check/time-of-use problem: changing the singleton after TC creation but before GP elevation changes the future GP's duration, quorum, and threshold. The proposed snapshot design removes that behavior.

## Goal

Allow any community member who can currently create a TC to select an active, owner-managed parameter set without needing an owner badge.

The component owner remains responsible for maintaining the registry. Community members can select parameter sets but cannot add, edit, or retire them.

## Out of Scope

- Election flows, stages, reruns, nomination rules, and election parameter sets.
- Percentage-based quorum or automatic circulating-supply calculation.
- Additional outcome rules such as the Treasury/Budget unique-address floor.
- Changes to the existing TC or GP ballot mechanics.
- Carrying data or component schemas forward from the current development version.
- UI implementation; only the required downstream UI direction is recorded.

## Scrypto Data Model

### Parameter set identifier

Use a stable string identifier as the `KeyValueStore` key. Examples are `default`, `constitutional`, and `treasury-budget`.

The identifier is immutable after creation. A separate label can be edited for display purposes.

```rust
#[derive(ScryptoSbor, ManifestSbor, Clone, Debug)]
pub struct GovernanceParameterSetInput {
    pub label: String,
    pub parameters: GovernanceParameters,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct GovernanceParameterSet {
    pub label: String,
    pub version: u32,
    pub retired: bool,
    pub parameters: GovernanceParameters,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct GovernanceParameterSetSnapshot {
    pub id: String,
    pub label: String,
    pub version: u32,
    pub parameters: GovernanceParameters,
}
```

`GovernanceParameters` keeps its current six fields and fixed-XRD quorum semantics. Registry records and immutable consultation snapshots reuse the same type. The collector and UI read quorum and approval values through the nested snapshot instead of duplicate flat consultation fields.

Callers supply `GovernanceParameterSetInput`. The component owns `version` and `retired`; transaction manifests must not be able to choose either value.

`GovernanceParameterSetSnapshot` is created only by the component after resolving an active registry entry. It deliberately omits `retired`: retirement is registry lifecycle state and must not alter or reinterpret an existing consultation snapshot.

### Component state

Replace the singleton field with a parameter registry:

```rust
struct Governance {
    pub parameter_sets: KeyValueStore<String, GovernanceParameterSet>,
    pub temperature_checks: KeyValueStore<u64, TemperatureCheck>,
    pub temperature_check_count: u64,
    pub proposals: KeyValueStore<u64, Proposal>,
    pub proposal_count: u64,
}
```

The component does not need an overview of all parameter-set identifiers. It uses direct KVS lookup to validate the identifier supplied during TC creation. Off-chain consumers use the Gateway's paginated KVS key and data endpoints to enumerate all records and populate the UI.

The Gateway reads all key pages and their values at one stable ledger state so the UI does not combine keys and values from different ledger states. No separate identifier vector or arbitrary registry-size limit is required on-ledger.

`default` is a reserved identifier. It is created during component instantiation and cannot be retired.

No usage counter is needed because records are never deleted.

## Parameter Lifecycle

### Add

The owner adds a new identifier, label, and six-field `GovernanceParameters` value. The component rejects identifiers that already exist, including identifiers belonging to retired sets.

New records start with:

```text
version = 1
retired = false
```

### Edit

The owner can edit the label and parameter values of an active set. Each successful edit increments its version.

Editing affects only TCs created after the edit. Existing TCs and their later GPs continue using the snapshot taken when the TC was created.

### Retire

The owner can permanently retire any non-default set. Retirement:

- Keeps the record in the KVS.
- Prevents the set from being selected for new TCs.
- Does not affect existing TCs or their elevation to GPs.
- Makes the retired record immutable.
- Does not permit the identifier to be reused.
- Does not increment `version`.

There is no delete or reactivate method. If a retired policy is needed again, the owner adds a new parameter set with a new identifier.

`version` identifies revisions to the editable label and six parameter values. Retirement changes lifecycle state, not parameter content, so the retirement event reports the existing version.

## Authorization

No new roles are introduced.

The existing `owner` role protects:

```text
add_governance_parameter_set
update_governance_parameter_set
retire_governance_parameter_set
```

TC creation remains public, and parameter-set state remains readable off-chain through the Gateway. Creating a TC still requires proof of control over the author account, exactly as it does now.

`enable_method_auth!` and the component royalty registration in `scrypto/src/governance.rs` must both be updated for the three new mutation methods. The obsolete singleton getter/updater registrations are removed. No role declaration or badge rule is added.

## Public API

The signatures below are the proposed external contract and should be checked against Scrypto 1.3.1 SBOR and manifest constraints.

### Instantiation

Replace the singleton instantiation input with an input record for the reserved default set:

```rust
pub fn instantiate(
    owner_badge: ResourceAddress,
    default_parameter_set: GovernanceParameterSetInput,
) -> Global<Governance>
```

Instantiation validates the input, creates the parameter KVS, and inserts `"default"` at version 1 with `retired = false`.

### Owner mutations

```rust
pub fn add_governance_parameter_set(
    &mut self,
    parameter_set_id: String,
    input: GovernanceParameterSetInput,
)

pub fn update_governance_parameter_set(
    &mut self,
    parameter_set_id: String,
    input: GovernanceParameterSetInput,
)

pub fn retire_governance_parameter_set(
    &mut self,
    parameter_set_id: String,
)
```

All three methods use the existing `owner` role. Add rejects every identifier already present in the KVS. Update rejects missing or retired records and increments the version internally. Retire rejects `"default"`, missing records, and records already retired.

### TC creation

Use one public creation method with an optional parameter-set identifier:

```rust
pub fn make_temperature_check(
    &mut self,
    author: Global<Account>,
    draft: TemperatureCheckDraft,
    parameter_set_id: Option<String>,
) -> u64
```

The input semantics are:

- `None` resolves to the reserved `default` set.
- `Some(active_id)` resolves to that active set.
- `Some(unknown_id)` fails instead of falling back to `default`.
- `Some(retired_id)` fails instead of falling back to `default`.

The TC always stores the resolved concrete identifier as a `String`, including `"default"`. Stored consultation records never contain an optional identifier.

The component exposes the parameter-set KVS address in its state. It does not provide methods for enumerating identifiers or values; the Gateway handles those reads off-chain.

### Removed singleton API

The updated component removes `get_governance_parameters` and `update_governance_parameters`. Off-chain callers read the registry KVS, and the owner updates `"default"` through `update_governance_parameter_set` like any other active record.

All clients switch to the new component address and schema together; the removed singleton methods are not retained as wrappers.

### Consultation-type selection boundary

The component validates that the selected parameter set exists and is active. It cannot determine whether the subject of a consultation semantically matches the selected vote type. This is an intentional governance boundary: the author selects the type, the UI clearly displays it and its voting rules, the community can challenge misuse, and the existing owner-gated GP elevation remains a final human review point. Owner-gated elevation is not treated as automated proof that the original selection was correct.

## Snapshot Semantics

The full selected parameter-set identity and `GovernanceParameters` value must be copied into the TC at creation time.

Add one field to `TemperatureCheck`:

```rust
pub parameter_set: GovernanceParameterSetSnapshot,
```

Remove the existing flat `quorum` and `approval_threshold` fields from `TemperatureCheck`. Keep `start` and `deadline`: they are the consultation's actual schedule and are used directly by voting logic.

TC creation must:

1. Resolve `None` to `default` or look up the supplied identifier.
2. Reject a missing or retired record.
3. Build one `GovernanceParameterSetSnapshot` from the resolved KVS key and record.
4. Derive `deadline` from `start` and `snapshot.parameters.temperature_check_days`.
5. Store the snapshot without copying its quorum or threshold into other fields.

Add the same snapshot field to `Proposal`:

```rust
pub parameter_set: GovernanceParameterSetSnapshot,
```

Remove the existing flat `quorum` and `approval_threshold` fields from `Proposal`. When `make_proposal` elevates a TC, it copies `tc.parameter_set` into the proposal and uses `tc.parameter_set.parameters.proposal_*`. It must never look up the current registry record during elevation.

The authoritative voting values are:

```text
TC quorum     = tc.parameter_set.parameters.temperature_check_quorum
TC threshold  = tc.parameter_set.parameters.temperature_check_approval_threshold
GP quorum     = proposal.parameter_set.parameters.proposal_quorum
GP threshold  = proposal.parameter_set.parameters.proposal_approval_threshold
```

```text
Active parameter set v1
        |
        | create TC
        v
TC stores complete v1 parameter-set snapshot
        |
        | parameter set edited to v2
        |
        | elevate original TC
        v
GP copies the TC's v1 snapshot and uses its proposal parameters
```

This prevents an owner edit between TC creation and GP elevation from changing the rules of an in-flight consultation.

The construction invariants are:

- `tc.deadline == tc.start + tc.parameter_set.parameters.temperature_check_days`.
- `proposal.deadline == proposal.start + proposal.parameter_set.parameters.proposal_length_days`.
- `proposal.parameter_set` equals the snapshot stored by its source TC.
- No tallying or display path reads the live registry to interpret an existing TC or GP.

## Validation

All instantiation, add, and update paths use the same validation helpers and named constants:

1. Identifier length is 1-64 ASCII bytes.
2. Identifier characters are lowercase `a-z`, digits `0-9`, or hyphens; leading, trailing, and consecutive hyphens are rejected. Implement this with a byte scan because the accepted alphabet is ASCII.
3. Label is 1-128 UTF-8 bytes, is not blank, and has no leading or trailing whitespace. Reject invalid labels instead of silently normalizing them.
4. TC and GP durations are greater than zero. There is no additional policy maximum beyond the range of the existing `u16` fields.
5. TC and GP fixed quora are greater than zero.
6. TC and GP approval thresholds are greater than zero and at most one.

The component does not determine circulating supply or change quora automatically. The RAC reviews the fixed XRD-equivalent amounts and updates active parameter sets when required.

Version increments must use checked arithmetic. Exhaustion should fail the update rather than wrap to zero. Retirement does not increment the version.

## Events

Add the following Scrypto events:

```rust
#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct GovernanceParameterSetAddedEvent {
    pub parameter_set_id: String,
    pub parameter_set: GovernanceParameterSet,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct GovernanceParameterSetUpdatedEvent {
    pub parameter_set_id: String,
    pub previous_version: u32,
    pub parameter_set: GovernanceParameterSet,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct GovernanceParameterSetRetiredEvent {
    pub parameter_set_id: String,
    pub version: u32,
}
```

Each event includes the stable identifier and relevant version. Added and updated events include the resulting record so an external indexer or cache can process changes without rereading the entire KVS. Gateway KVS enumeration remains the authoritative discovery path.

`GovernanceParametersUpdatedEvent` is replaced by the new add/update/retire events.

Extend `TemperatureCheckCreatedEvent` and `ProposalCreatedEvent` with the parameter-set identifier and version. Update the shared creation-event schemas used by the consultation UI. The vote collector handles only vote events, so its event handlers do not change. The stored TC and proposal records remain the source of truth.

## Off-Chain Registry Read Flow

The registry remains on-ledger even though the component does not maintain an identifier index. The shared TypeScript layer should reuse the existing `GetKeyValueStoreService` pagination/data service and add governance-specific decoding:

1. Decode the `parameter_sets` internal KVS address from component state.
2. Use `GetKeyValueStoreService` to exhaust every key page at a stable ledger state.
3. Decode each key as `String` and each value as `GovernanceParameterSet`.
4. Return active and retired records as separately typed collections for the UI.
5. Treat events as cache invalidation hints, not as the authoritative registry source.

This requires a new registry read operation and schemas, but no new Gateway pagination implementation.

The Scrypto component still enforces existence and retirement status independently. A stale or malicious UI cannot create a TC with a missing or retired set because `make_temperature_check` performs its own KVS lookup.

## Initial Parameter Sets

The blueprint should not hardcode Charter policy values. Instantiation creates only `default`; owner-authorized transactions then add the approved records.

The first non-election registry can contain:

- `default`
- `constitutional`
- `governance-process`
- `treasury-budget`
- `executable`

Each record must use a concrete duration and a fixed XRD-equivalent quorum approved by the RAC. Charter duration ranges cannot be stored as ranges because a TC needs one exact deadline when it is created.

Election identifiers are deliberately absent until the election requirements are incorporated into this plan.

## Scrypto Implementation Steps

1. Add the registry record, events, constants, and snapshot fields in `scrypto/src/lib.rs`.
2. Add registry state, shared validation, and owner-only lifecycle methods in `scrypto/src/governance.rs`.
3. Update the single TC creation method to resolve its optional identifier and snapshot the selected set.
4. Change GP elevation to use the TC snapshot and extend creation events with set identity.
5. Add simulator tests and update `scrypto/README.md` with instantiation and seed manifests.

## Scrypto Test Plan

### Registry and authorization

- Instantiation creates an active `default` at version 1.
- Owner proof can add, edit, and retire a non-default set.
- Missing or wrong owner proof fails every mutation.
- Duplicate and previously retired identifiers cannot be added.
- `default` cannot be retired.

### Validation and selection

- Zero durations and invalid fixed quora or thresholds fail.
- Identifier tests cover empty, 64-byte, over-length, uppercase, non-ASCII, leading/trailing-hyphen, and consecutive-hyphen cases.
- Label tests cover empty/blank, 128-byte, over-length, and leading/trailing-whitespace cases.
- `None` selects `default` and stores the concrete `"default"` identifier.
- `None` and `Some("default")` store equivalent parameter-set snapshots and derive equivalent voting values and deadline durations. Whole TC records are not compared because IDs, owned KVS addresses, and timestamps may differ.
- `Some(active_id)` selects and snapshots the requested active set.
- `Some(unknown_id)` fails without falling back to `default`.
- `Some(retired_id)` fails without falling back to `default`.

### Snapshot immutability

- A TC created with version 1 retains its complete snapshot after the registry is edited to version 2.
- A new TC created after the edit uses version 2.
- Elevating the version 1 TC copies the exact version 1 snapshot into the GP and derives its deadline from the version 1 proposal duration.
- Retiring the set does not prevent elevation of an existing TC.
- Retirement leaves the registry record's version unchanged.
- Creation events report the snapshotted identifier and version.
- TC and GP records contain no duplicate flat quorum or approval-threshold fields.

### Shared integration

- A string-keyed registry KVS round-trips through the shared SBOR and Effect schemas.
- Multi-page registry reads and value requests use one stable ledger state.
- Manifest builders encode `None` as `Enum<0u8>()` and `Some(id)` as `Enum<1u8>("id")`.
- Parameter-set labels and all other interpolated strings are safely serialized; quotes and newlines cannot produce malformed or injected manifest instructions.
- The consultation UI creation-event decoders accept the extended event records.

## Downstream Plan After Scrypto

### Shared package and vote collector

1. Regenerate or update `packages/shared/src/schemas.ts` for the new component, registry, TC, proposal, and event layouts, and update the domain transformations in `packages/shared/src/governance/schemas.ts`.
2. Add manifest builders for add, edit, retire, and optional-set TC creation. Safely serialize every string value rather than interpolating unescaped labels or content.
3. Enumerate and decode all parameter registry KVS entries at one stable ledger state.
4. Update the collector, tally script, and UI to read quorum and approval thresholds from the nested TC/GP snapshot while preserving fixed-XRD calculations.
5. Update the shared creation-event schemas used by the consultation app. Vote-event schemas and vote-collector handlers remain unchanged.

### Consultation UI

1. Load active parameter sets on the new-TC route.
2. Add a required parameter-set dropdown with `default` initially selected.
3. Submit `None` for `default` and `Some(id)` for every explicitly selected non-default set.
4. Replace the singleton admin form with a list supporting add, edit, and retire.
5. Replace the singleton parameter display on the About page and show the selected snapshot identity and values on TC/GP detail pages.

Retired sets remain visible in the admin view and on consultation records created before retirement, but never appear in the creation dropdown.

## Pre-Launch Deployment

The component state schema changes, so deployment uses a fresh package and Governance component. No development data is carried forward, and only the new component is configured in the collector and UI.

Suggested rollout:

1. Build and test the Scrypto package locally.
2. Deploy and seed a fresh component on Stokenet.
3. Update shared schemas, manifests, and the collector against Stokenet.
4. Add and verify the UI management and creation flows.
5. Deploy the package, component configuration, collector, and UI together for launch.

## Acceptance Criteria

- The UI discovers active sets through Gateway KVS enumeration, and any eligible community account can select one without an owner badge.
- Only the existing owner role can add, edit, or retire sets; sets are never deleted or reactivated.
- `default` is always available, and `None` resolves to its concrete identifier.
- Editing or retiring a set cannot change an existing TC or the GP elevated from it.
- TCs and GPs store one nested parameter-set snapshot and contain no duplicate flat quorum or approval-threshold fields.
- All tally and display paths interpret existing consultations from their snapshots, never from the live registry.
- All quora remain explicit fixed XRD-equivalent amounts maintained by the RAC.

## Deferred Input

The election requirements document will determine whether elections reuse this registry, require additional parameter fields, or require a separate blueprint/process. No election design should be inferred before that document is reviewed.

## Estimated Work

| Phase | Estimate |
|---|---:|
| Scrypto implementation and simulator tests | 1.5-2.5 days |
| Shared schemas, manifests, and collector updates | 1-1.5 days |
| Admin UI, TC dropdown, and detail displays | 1.5-2.5 days |
| Stokenet rollout and end-to-end verification | 0.5-1 day |

Election work is excluded from these estimates.

## Reviewer Checklist

The review should answer these questions explicitly:

1. Are the proposed Scrypto types, KVS ownership, method signatures, role declarations, and SBOR derives valid for Scrypto 1.3.1?
2. Does snapshotting the full parameter-set identity and six-field value on both TC and GP prevent parameter changes from affecting an in-flight or elevated consultation without duplicate voting fields?
3. Can the existing Gateway services enumerate and decode the string-keyed KVS consistently at one ledger state without an on-ledger identifier index or new pagination implementation?
4. Are add, update, retirement, default resolution, validation, versioning, and event semantics complete and resistant to unauthorized or ambiguous state changes?
5. Does the pre-launch rollout identify every Scrypto, shared-schema, manifest, event-consumer, vote-collector, UI, and configuration change required for a coordinated release?

Return the review in this order:

1. Blocking correctness or feasibility issues.
2. Security and governance risks.
3. Integration, deployment, and test gaps.
4. Non-blocking simplifications or maintainability improvements.
5. Final verdict: ready to implement, ready with named changes, or requires redesign.
