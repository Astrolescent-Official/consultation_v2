use consultation_blueprint::*;
use scrypto::prelude::Url;
use scrypto_test::prelude::*;

#[derive(ScryptoSbor)]
struct GovernanceState {
    parameter_sets: Own,
    temperature_checks: Own,
    temperature_check_count: u64,
    proposals: Own,
    proposal_count: u64,
    majority_judgment_elections: Own,
    majority_judgment_election_count: u64,
}

struct TestAccount {
    address: ComponentAddress,
    public_key: Secp256k1PublicKey,
}

struct Owner {
    badge: ResourceAddress,
    account: TestAccount,
}

type TestLedger = LedgerSimulator<NoExtension, InMemorySubstateDatabase>;

fn create_account(ledger: &mut TestLedger) -> TestAccount {
    let (public_key, _private_key, address) = ledger.new_allocated_account();
    TestAccount {
        address,
        public_key,
    }
}

fn create_owner(ledger: &mut TestLedger) -> Owner {
    let account = create_account(ledger);
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_fungible_resource(
            OwnerRole::None,
            false,
            0,
            FungibleResourceRoles::default(),
            metadata!(),
            Some(dec!(1)),
        )
        .try_deposit_entire_worktop_or_abort(account.address, None)
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&account.public_key)],
    );
    let badge = receipt.expect_commit(true).new_resource_addresses()[0];
    Owner { badge, account }
}

fn owner_builder(owner: &Owner) -> ManifestBuilder {
    ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner.account.address, owner.badge, dec!(1))
}

fn owner_signers(owner: &Owner) -> Vec<NonFungibleGlobalId> {
    vec![NonFungibleGlobalId::from_public_key(
        &owner.account.public_key,
    )]
}

fn standard_parameters() -> GovernanceProcessParameters {
    GovernanceProcessParameters::Standard {
        temperature_check: TemperatureCheckParameters {
            voting_days: 1,
            quorum: dec!(1000),
            approval_threshold: dec!("0.6"),
        },
        proposal: StandardProposalParameters {
            voting_days: 2,
            quorum: dec!(5000),
            approval_threshold: dec!("0.7"),
        },
    }
}

fn majority_judgment_parameters() -> GovernanceProcessParameters {
    GovernanceProcessParameters::MajorityJudgment {
        temperature_check: TemperatureCheckParameters {
            voting_days: 1,
            quorum: dec!(1000),
            approval_threshold: dec!("0.6"),
        },
        election: MajorityJudgmentParameters {
            voting_days: 1,
            quorum: dec!(5000),
            minimum_median_grade: Grade::Good,
            rerun_voting_days: 1,
            rerun_quorum: dec!(2500),
            rerun_minimum_median_grade: Grade::VeryGood,
            reserve_list_days: 30,
        },
    }
}

fn instantiate(ledger: &mut TestLedger, owner: &Owner) -> ComponentAddress {
    let package = ledger.compile_and_publish(this_package!());
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package,
            "Governance",
            "instantiate",
            manifest_args!(
                owner.badge,
                GovernanceParameterSetInput {
                    label: "Default".to_string(),
                    parameters: standard_parameters(),
                }
            ),
        )
        .build();
    ledger
        .execute_manifest(manifest, vec![])
        .expect_commit_success()
        .new_component_addresses()[0]
}

fn add_parameter_set(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    owner: &Owner,
    id: &str,
    input: GovernanceParameterSetInput,
    should_succeed: bool,
) {
    let manifest = owner_builder(owner)
        .call_method(
            component,
            "add_governance_parameter_set",
            manifest_args!(id.to_string(), input),
        )
        .build();
    let receipt = ledger.execute_manifest(manifest, owner_signers(owner));
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn update_parameter_set(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    owner: &Owner,
    id: &str,
    input: GovernanceParameterSetInput,
    should_succeed: bool,
) {
    let manifest = owner_builder(owner)
        .call_method(
            component,
            "update_governance_parameter_set",
            manifest_args!(id.to_string(), input),
        )
        .build();
    let receipt = ledger.execute_manifest(manifest, owner_signers(owner));
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn add_mj_parameters(ledger: &mut TestLedger, component: ComponentAddress, owner: &Owner) {
    add_parameter_set(
        ledger,
        component,
        owner,
        "election",
        GovernanceParameterSetInput {
            label: "Permanent RAC".to_string(),
            parameters: majority_judgment_parameters(),
        },
        true,
    );
}

fn mj_parameters_with(
    mutate: impl FnOnce(&mut MajorityJudgmentParameters),
) -> GovernanceProcessParameters {
    let mut parameters = majority_judgment_parameters();
    if let GovernanceProcessParameters::MajorityJudgment { election, .. } = &mut parameters {
        mutate(election);
    }
    parameters
}

fn candidates() -> Vec<MajorityJudgmentCandidateInput> {
    ["alice", "bob", "carol"]
        .into_iter()
        .map(|reference| MajorityJudgmentCandidateInput {
            reference: reference.to_string(),
            display_name: reference.to_uppercase(),
            description: format!("{reference} profile"),
            links: vec![Url::of(format!("https://example.com/{reference}"))],
        })
        .collect()
}

fn mj_draft() -> TemperatureCheckDraft {
    TemperatureCheckDraft {
        title: "Permanent RAC election".to_string(),
        short_description: "Elect two RAC members".to_string(),
        description: "Candidate commitment for the Permanent RAC".to_string(),
        links: vec![Url::of("https://example.com/election")],
        follow_up: TemperatureCheckFollowUpDraft::MajorityJudgmentElection {
            role_id: "permanent-rac".to_string(),
            seat_count: 2,
            candidates: candidates(),
        },
    }
}

fn standard_draft(title: &str) -> TemperatureCheckDraft {
    TemperatureCheckDraft {
        title: title.to_string(),
        short_description: "A standard consultation".to_string(),
        description: "Standard proposal body".to_string(),
        links: vec![Url::of("https://example.com/standard")],
        follow_up: TemperatureCheckFollowUpDraft::StandardProposal {
            vote_options: vec![
                ProposalVoteOptionInput {
                    label: "For".to_string(),
                },
                ProposalVoteOptionInput {
                    label: "Against".to_string(),
                },
            ],
            max_selections: None,
        },
    }
}

#[allow(clippy::too_many_arguments)]
fn create_election(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    owner: &Owner,
    draft: TemperatureCheckDraft,
    tc_start: i64,
    tc_end: i64,
    voting_start: i64,
    voting_end: i64,
    order: Vec<MajorityJudgmentCandidateId>,
    authorized: bool,
    should_succeed: bool,
) -> TransactionReceipt {
    let builder = if authorized {
        owner_builder(owner)
    } else {
        ManifestBuilder::new().lock_fee_from_faucet()
    };
    let manifest = builder
        .call_method(
            component,
            "make_majority_judgment_election",
            manifest_args!(
                owner.account.address,
                draft,
                "election".to_string(),
                Instant::new(tc_start),
                Instant::new(tc_end),
                Instant::new(voting_start),
                Instant::new(voting_end),
                order
            ),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        if authorized {
            owner_signers(owner)
        } else {
            vec![]
        },
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
    receipt
}

fn record_outcome(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    owner: &Owner,
    temperature_check_id: u64,
    passed: bool,
    should_succeed: bool,
) {
    let manifest = owner_builder(owner)
        .call_method(
            component,
            "record_temperature_check_outcome",
            manifest_args!(temperature_check_id, passed),
        )
        .build();
    let receipt = ledger.execute_manifest(manifest, owner_signers(owner));
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn advance_to(ledger: &mut TestLedger, seconds_since_epoch: i64) {
    let next_round = ledger.get_consensus_manager_state().round.number() + 1;
    ledger
        .advance_to_round_at_timestamp(Round::of(next_round), seconds_since_epoch * 1000)
        .expect_commit_success();
}

fn read_temperature_check(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    id: u64,
) -> TemperatureCheck {
    let state: GovernanceState = ledger.component_state(component);
    ledger
        .get_kv_store_entry(state.temperature_checks, &id)
        .expect("temperature check should exist")
}

fn read_election(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    id: u64,
) -> MajorityJudgmentElection {
    let state: GovernanceState = ledger.component_state(component);
    ledger
        .get_kv_store_entry(state.majority_judgment_elections, &id)
        .expect("election should exist")
}

fn complete_ballot() -> Vec<CandidateGrade> {
    vec![
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(2),
            grade: Grade::Excellent,
        },
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(0),
            grade: Grade::Good,
        },
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(1),
            grade: Grade::Acceptable,
        },
    ]
}

fn alternate_ballot() -> Vec<CandidateGrade> {
    vec![
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(0),
            grade: Grade::Poor,
        },
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(1),
            grade: Grade::Excellent,
        },
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(2),
            grade: Grade::Acceptable,
        },
    ]
}

fn vote_mj_round(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    voter: &TestAccount,
    election_id: u64,
    round: MajorityJudgmentRoundId,
    grades: Vec<CandidateGrade>,
    should_succeed: bool,
) -> TransactionReceipt {
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "vote_on_majority_judgment_election",
            manifest_args!(voter.address, election_id, round, grades),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&voter.public_key)],
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
    receipt
}

fn vote_mj(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    voter: &TestAccount,
    election_id: u64,
    should_succeed: bool,
) {
    vote_mj_round(
        ledger,
        component,
        voter,
        election_id,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        should_succeed,
    );
}

fn start_rerun(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    owner: &Owner,
    election_id: u64,
    voting_start: Instant,
    authorized: bool,
    should_succeed: bool,
) {
    let builder = if authorized {
        owner_builder(owner)
    } else {
        ManifestBuilder::new().lock_fee_from_faucet()
    };
    let manifest = builder
        .call_method(
            component,
            "start_majority_judgment_rerun",
            manifest_args!(election_id, voting_start),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        if authorized {
            owner_signers(owner)
        } else {
            vec![]
        },
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn record_tie_resolution(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    owner: &Owner,
    election_id: u64,
    round: MajorityJudgmentRoundId,
    ordered_candidate_ids: Vec<MajorityJudgmentCandidateId>,
    authorized: bool,
    should_succeed: bool,
) {
    let builder = if authorized {
        owner_builder(owner)
    } else {
        ManifestBuilder::new().lock_fee_from_faucet()
    };
    let manifest = builder
        .call_method(
            component,
            "record_majority_judgment_tie_resolution",
            manifest_args!(election_id, round, ordered_candidate_ids),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        if authorized {
            owner_signers(owner)
        } else {
            vec![]
        },
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn toggle_hidden(
    ledger: &mut TestLedger,
    component: ComponentAddress,
    owner: &Owner,
    election_id: u64,
    authorized: bool,
    should_succeed: bool,
) -> TransactionReceipt {
    let builder = if authorized {
        owner_builder(owner)
    } else {
        ManifestBuilder::new().lock_fee_from_faucet()
    };
    let manifest = builder
        .call_method(
            component,
            "toggle_majority_judgment_election_hidden",
            manifest_args!(election_id),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        if authorized {
            owner_signers(owner)
        } else {
            vec![]
        },
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
    receipt
}

#[test]
fn election_creation_is_atomic_and_keeps_one_canonical_temperature_check() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner);
    add_mj_parameters(&mut ledger, component, &owner);
    let order = vec![
        MajorityJudgmentCandidateId(2),
        MajorityJudgmentCandidateId(0),
        MajorityJudgmentCandidateId(1),
    ];

    create_election(
        &mut ledger,
        component,
        &owner,
        mj_draft(),
        86_400,
        172_800,
        259_200,
        345_600,
        order.clone(),
        false,
        false,
    );
    create_election(
        &mut ledger,
        component,
        &owner,
        mj_draft(),
        86_400,
        86_401,
        259_200,
        345_600,
        order.clone(),
        true,
        false,
    );
    create_election(
        &mut ledger,
        component,
        &owner,
        mj_draft(),
        86_400,
        172_800,
        259_200,
        345_600,
        vec![
            MajorityJudgmentCandidateId(0),
            MajorityJudgmentCandidateId(0),
            MajorityJudgmentCandidateId(1),
        ],
        true,
        false,
    );
    let receipt = create_election(
        &mut ledger,
        component,
        &owner,
        mj_draft(),
        86_400,
        172_800,
        259_200,
        345_600,
        order,
        true,
        true,
    );

    let events = &receipt.expect_commit_success().application_events;
    assert!(events
        .iter()
        .any(|(identifier, _)| identifier.1 == "TemperatureCheckCreatedEvent"));
    assert!(events
        .iter()
        .any(|(identifier, _)| identifier.1 == "MajorityJudgmentElectionCreatedEvent"));

    let state: GovernanceState = ledger.component_state(component);
    assert_eq!(state.temperature_check_count, 1);
    assert_eq!(state.majority_judgment_election_count, 1);
    let tc = read_temperature_check(&mut ledger, component, 0);
    let election = read_election(&mut ledger, component, 0);

    assert_eq!(tc.snapshot, Instant::new(0));
    assert_eq!(tc.start, Instant::new(86_400));
    assert_eq!(tc.deadline, Instant::new(172_800));
    assert_eq!(
        tc.continuation,
        Some(ConsultationContinuation::MajorityJudgmentElection(0))
    );
    assert!(tc.outcome.is_none());
    match tc.follow_up {
        TemperatureCheckFollowUp::MajorityJudgmentElection {
            role_id,
            seat_count,
            candidates,
        } => {
            assert_eq!(role_id, "permanent-rac");
            assert_eq!(seat_count, 2);
            assert_eq!(candidates[0].display_order, 1);
            assert_eq!(candidates[1].display_order, 2);
            assert_eq!(candidates[2].display_order, 0);
        }
        TemperatureCheckFollowUp::StandardProposal { .. } => panic!("expected MJ follow-up"),
    }
    assert_eq!(election.temperature_check_id, 0);
    assert_eq!(election.round_one.snapshot, tc.snapshot);
    assert_eq!(election.round_one.start, Instant::new(259_200));
    assert_eq!(election.round_one.deadline, Instant::new(345_600));
}

#[test]
fn tc_outcome_and_deadlines_gate_mj_voting_and_failed_elections_stay_closed() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let voter = create_account(&mut ledger);
    let component = instantiate(&mut ledger, &owner);
    add_mj_parameters(&mut ledger, component, &owner);
    let order = vec![
        MajorityJudgmentCandidateId(0),
        MajorityJudgmentCandidateId(1),
        MajorityJudgmentCandidateId(2),
    ];
    create_election(
        &mut ledger,
        component,
        &owner,
        mj_draft(),
        86_400,
        172_800,
        259_200,
        345_600,
        order.clone(),
        true,
        true,
    );

    vote_mj(&mut ledger, component, &voter, 0, false);
    record_outcome(&mut ledger, component, &owner, 0, false, false);
    advance_to(&mut ledger, 172_800);
    record_outcome(&mut ledger, component, &owner, 0, false, true);
    record_outcome(&mut ledger, component, &owner, 0, true, false);
    advance_to(&mut ledger, 259_200);
    vote_mj(&mut ledger, component, &voter, 0, false);

    create_election(
        &mut ledger,
        component,
        &owner,
        mj_draft(),
        345_600,
        432_000,
        518_400,
        604_800,
        order,
        true,
        true,
    );
    advance_to(&mut ledger, 432_000);
    record_outcome(&mut ledger, component, &owner, 1, true, true);
    vote_mj(&mut ledger, component, &voter, 1, false);
    advance_to(&mut ledger, 518_400);
    vote_mj(&mut ledger, component, &voter, 1, true);

    let tc = read_temperature_check(&mut ledger, component, 1);
    assert!(tc.outcome.is_some_and(TemperatureCheckOutcome::passed));
    let election = read_election(&mut ledger, component, 1);
    assert_eq!(election.round_one.vote_count, 1);

    advance_to(&mut ledger, 604_800);
    let rerun_manifest = owner_builder(&owner)
        .call_method(
            component,
            "start_majority_judgment_rerun",
            manifest_args!(1u64, Instant::new(604_800)),
        )
        .build();
    ledger
        .execute_manifest(rerun_manifest, owner_signers(&owner))
        .expect_commit_success();
    let election = read_election(&mut ledger, component, 1);
    assert_eq!(
        election.rerun.expect("rerun should exist").snapshot,
        tc.snapshot
    );
}

#[test]
fn standard_proposal_creation_requires_a_recorded_passed_tc() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner);

    let make_tc = |ledger: &mut TestLedger, title: &str| {
        let manifest = ManifestBuilder::new()
            .lock_fee_from_faucet()
            .call_method(
                component,
                "make_temperature_check",
                manifest_args!(owner.account.address, standard_draft(title), None::<String>),
            )
            .build();
        ledger
            .execute_manifest(manifest, owner_signers(&owner))
            .expect_commit_success();
    };
    let make_proposal = |ledger: &mut TestLedger, id: u64, should_succeed: bool| {
        let manifest = owner_builder(&owner)
            .call_method(component, "make_proposal", manifest_args!(id))
            .build();
        let receipt = ledger.execute_manifest(manifest, owner_signers(&owner));
        if should_succeed {
            receipt.expect_commit_success();
        } else {
            receipt.expect_commit_failure();
        }
    };

    make_tc(&mut ledger, "Failed standard TC");
    advance_to(&mut ledger, 86_400);
    make_proposal(&mut ledger, 0, false);
    record_outcome(&mut ledger, component, &owner, 0, false, true);
    make_proposal(&mut ledger, 0, false);

    make_tc(&mut ledger, "Passed standard TC");
    advance_to(&mut ledger, 172_800);
    record_outcome(&mut ledger, component, &owner, 1, true, true);
    make_proposal(&mut ledger, 1, true);

    let state: GovernanceState = ledger.component_state(component);
    assert_eq!(state.proposal_count, 1);
}

#[test]
fn majority_judgment_parameter_boundaries_are_enforced() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner);

    let invalid_cases = vec![
        mj_parameters_with(|election| election.voting_days = 0),
        mj_parameters_with(|election| election.rerun_voting_days = 0),
        mj_parameters_with(|election| election.reserve_list_days = 0),
        mj_parameters_with(|election| election.quorum = Decimal::ZERO),
        mj_parameters_with(|election| election.rerun_quorum = Decimal::ZERO),
        mj_parameters_with(|election| election.rerun_quorum = election.quorum),
        mj_parameters_with(|election| {
            election.rerun_minimum_median_grade = election.minimum_median_grade
        }),
    ];

    for parameters in invalid_cases {
        add_parameter_set(
            &mut ledger,
            component,
            &owner,
            "invalid",
            GovernanceParameterSetInput {
                label: "Invalid".to_string(),
                parameters,
            },
            false,
        );
    }

    // A well-formed Majority Judgment parameter set is still accepted.
    add_mj_parameters(&mut ledger, component, &owner);
}

#[test]
fn majority_judgment_candidate_count_boundaries_are_enforced() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner);
    add_mj_parameters(&mut ledger, component, &owner);

    let candidates_of = |count: usize| -> Vec<MajorityJudgmentCandidateInput> {
        (0..count)
            .map(|index| MajorityJudgmentCandidateInput {
                reference: format!("candidate-{index}"),
                display_name: format!("Candidate {index}"),
                description: "profile".to_string(),
                links: vec![],
            })
            .collect()
    };
    let order_of = |count: usize| -> Vec<MajorityJudgmentCandidateId> {
        (0..count)
            .map(|index| MajorityJudgmentCandidateId(u32::try_from(index).unwrap()))
            .collect()
    };
    let draft_with =
        |candidates: Vec<MajorityJudgmentCandidateInput>, seat_count: u32| TemperatureCheckDraft {
            follow_up: TemperatureCheckFollowUpDraft::MajorityJudgmentElection {
                role_id: "permanent-rac".to_string(),
                seat_count,
                candidates,
            },
            ..mj_draft()
        };

    // Fewer than the minimum candidate count.
    create_election(
        &mut ledger,
        component,
        &owner,
        draft_with(candidates_of(1), 1),
        86_400,
        172_800,
        259_200,
        345_600,
        order_of(1),
        true,
        false,
    );

    // More than the maximum candidate count.
    create_election(
        &mut ledger,
        component,
        &owner,
        draft_with(candidates_of(21), 1),
        86_400,
        172_800,
        259_200,
        345_600,
        order_of(21),
        true,
        false,
    );

    // Seat count must be strictly lower than the candidate count.
    create_election(
        &mut ledger,
        component,
        &owner,
        draft_with(candidates_of(3), 3),
        86_400,
        172_800,
        259_200,
        345_600,
        order_of(3),
        true,
        false,
    );

    // Within bounds, election creation succeeds.
    create_election(
        &mut ledger,
        component,
        &owner,
        draft_with(candidates_of(3), 2),
        86_400,
        172_800,
        259_200,
        345_600,
        order_of(3),
        true,
        true,
    );
}

#[test]
fn parameter_variants_candidate_rules_and_snapshots_are_enforced() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner);
    add_mj_parameters(&mut ledger, component, &owner);

    let order = vec![
        MajorityJudgmentCandidateId(0),
        MajorityJudgmentCandidateId(1),
        MajorityJudgmentCandidateId(2),
    ];

    // A Majority Judgment draft cannot use the default Standard parameter set.
    let manifest = owner_builder(&owner)
        .call_method(
            component,
            "make_majority_judgment_election",
            manifest_args!(
                owner.account.address,
                mj_draft(),
                DEFAULT_PARAMETER_SET_ID.to_string(),
                Instant::new(86_400),
                Instant::new(172_800),
                Instant::new(259_200),
                Instant::new(345_600),
                order.clone()
            ),
        )
        .build();
    ledger
        .execute_manifest(manifest, owner_signers(&owner))
        .expect_commit_failure();

    // A Standard draft cannot use a Majority Judgment parameter set.
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "make_temperature_check",
            manifest_args!(
                owner.account.address,
                standard_draft("Mismatched"),
                Some("election".to_string())
            ),
        )
        .build();
    ledger
        .execute_manifest(manifest, owner_signers(&owner))
        .expect_commit_failure();

    // Duplicate candidate references are rejected.
    let mut duplicate_candidates = candidates();
    duplicate_candidates[1].reference = duplicate_candidates[0].reference.clone();
    let duplicate_draft = TemperatureCheckDraft {
        follow_up: TemperatureCheckFollowUpDraft::MajorityJudgmentElection {
            role_id: "permanent-rac".to_string(),
            seat_count: 2,
            candidates: duplicate_candidates,
        },
        ..mj_draft()
    };
    create_election(
        &mut ledger,
        component,
        &owner,
        duplicate_draft,
        86_400,
        172_800,
        259_200,
        345_600,
        order.clone(),
        true,
        false,
    );

    // Invalid candidate URLs are rejected.
    let mut invalid_url_candidates = candidates();
    invalid_url_candidates[0].links = vec![Url::of("not-a-url")];
    let invalid_url_draft = TemperatureCheckDraft {
        follow_up: TemperatureCheckFollowUpDraft::MajorityJudgmentElection {
            role_id: "permanent-rac".to_string(),
            seat_count: 2,
            candidates: invalid_url_candidates,
        },
        ..mj_draft()
    };
    create_election(
        &mut ledger,
        component,
        &owner,
        invalid_url_draft,
        86_400,
        172_800,
        259_200,
        345_600,
        order,
        true,
        false,
    );

    // The default governance parameter set must remain Standard.
    update_parameter_set(
        &mut ledger,
        component,
        &owner,
        DEFAULT_PARAMETER_SET_ID,
        GovernanceParameterSetInput {
            label: "Default".to_string(),
            parameters: majority_judgment_parameters(),
        },
        false,
    );

    // A parameter set's variant cannot change once created.
    update_parameter_set(
        &mut ledger,
        component,
        &owner,
        "election",
        GovernanceParameterSetInput {
            label: "Permanent RAC".to_string(),
            parameters: standard_parameters(),
        },
        false,
    );
}

#[test]
fn complete_ballots_revote_rerun_tie_record_and_events_are_round_local() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let voter_one = create_account(&mut ledger);
    let voter_two = create_account(&mut ledger);
    let component = instantiate(&mut ledger, &owner);
    add_mj_parameters(&mut ledger, component, &owner);

    let order = vec![
        MajorityJudgmentCandidateId(0),
        MajorityJudgmentCandidateId(1),
        MajorityJudgmentCandidateId(2),
    ];
    create_election(
        &mut ledger,
        component,
        &owner,
        mj_draft(),
        86_400,
        172_800,
        259_200,
        345_600,
        order,
        true,
        true,
    );

    advance_to(&mut ledger, 172_800);
    record_outcome(&mut ledger, component, &owner, 0, true, true);

    // Voting has not started yet, even with a well-formed ballot.
    vote_mj_round(
        &mut ledger,
        component,
        &voter_one,
        0,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        false,
    );

    // An incomplete ballot is rejected.
    vote_mj_round(
        &mut ledger,
        component,
        &voter_one,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(0),
            grade: Grade::Good,
        }],
        false,
    );

    // A ballot referencing an unknown candidate is rejected.
    vote_mj_round(
        &mut ledger,
        component,
        &voter_one,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(0),
                grade: Grade::Good,
            },
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(1),
                grade: Grade::Good,
            },
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(99),
                grade: Grade::Good,
            },
        ],
        false,
    );

    // Starting a rerun before Round 1 has ended is rejected.
    start_rerun(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(345_600),
        true,
        false,
    );

    advance_to(&mut ledger, 259_200);

    vote_mj_round(
        &mut ledger,
        component,
        &voter_one,
        0,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        true,
    );
    // Revoting replaces the voter's prior ballot rather than adding a new voter.
    vote_mj_round(
        &mut ledger,
        component,
        &voter_one,
        0,
        MajorityJudgmentRoundId::RoundOne,
        alternate_ballot(),
        true,
    );
    vote_mj_round(
        &mut ledger,
        component,
        &voter_two,
        0,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        true,
    );

    let election = read_election(&mut ledger, component, 0);
    assert_eq!(election.round_one.vote_count, 3);
    assert_eq!(election.round_one.revote_count, 1);

    // A tie resolution cannot be recorded before the round has ended.
    record_tie_resolution(
        &mut ledger,
        component,
        &owner,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![MajorityJudgmentCandidateId(0), MajorityJudgmentCandidateId(1)],
        true,
        false,
    );

    advance_to(&mut ledger, 345_600);

    // Voting after the round deadline is rejected.
    vote_mj_round(
        &mut ledger,
        component,
        &voter_two,
        0,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        false,
    );

    // A tie resolution must contain at least two candidates.
    record_tie_resolution(
        &mut ledger,
        component,
        &owner,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![MajorityJudgmentCandidateId(0)],
        true,
        false,
    );
    // A tie resolution's candidates must be unique.
    record_tie_resolution(
        &mut ledger,
        component,
        &owner,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![MajorityJudgmentCandidateId(0), MajorityJudgmentCandidateId(0)],
        true,
        false,
    );
    // A tie resolution cannot reference an unknown candidate.
    record_tie_resolution(
        &mut ledger,
        component,
        &owner,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![MajorityJudgmentCandidateId(0), MajorityJudgmentCandidateId(99)],
        true,
        false,
    );

    // Only the owner may start a rerun.
    start_rerun(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(345_600),
        false,
        false,
    );
    // A rerun cannot be scheduled to start in the past.
    start_rerun(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(300_000),
        true,
        false,
    );

    // The valid tie resolution for Round 1 succeeds.
    record_tie_resolution(
        &mut ledger,
        component,
        &owner,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![MajorityJudgmentCandidateId(0), MajorityJudgmentCandidateId(1)],
        true,
        true,
    );
    // A tie resolution can only be recorded once per election.
    record_tie_resolution(
        &mut ledger,
        component,
        &owner,
        0,
        MajorityJudgmentRoundId::RoundOne,
        vec![MajorityJudgmentCandidateId(0), MajorityJudgmentCandidateId(1)],
        true,
        false,
    );

    start_rerun(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(345_600),
        true,
        true,
    );
    // A rerun can only be started once.
    start_rerun(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(345_600),
        true,
        false,
    );

    let election = read_election(&mut ledger, component, 0);
    let rerun = election.rerun.expect("rerun should exist");
    assert_eq!(rerun.start, Instant::new(345_600));
    assert_eq!(rerun.deadline, Instant::new(432_000));
    assert_eq!(rerun.quorum, dec!(2500));
    assert_eq!(rerun.minimum_median_grade, Grade::VeryGood);

    // The rerun round is independent of Round 1: voting is immediately open.
    vote_mj_round(
        &mut ledger,
        component,
        &voter_one,
        0,
        MajorityJudgmentRoundId::Rerun,
        complete_ballot(),
        true,
    );

    // A tie resolution for the rerun cannot be recorded before it ends, and Round 1
    // already has a tie resolution recorded for the election.
    record_tie_resolution(
        &mut ledger,
        component,
        &owner,
        0,
        MajorityJudgmentRoundId::Rerun,
        vec![MajorityJudgmentCandidateId(0), MajorityJudgmentCandidateId(1)],
        true,
        false,
    );

    advance_to(&mut ledger, 432_000);

    // Voting after the rerun deadline is rejected.
    vote_mj_round(
        &mut ledger,
        component,
        &voter_two,
        0,
        MajorityJudgmentRoundId::Rerun,
        complete_ballot(),
        false,
    );

    let rerun = read_election(&mut ledger, component, 0)
        .rerun
        .expect("rerun should exist");
    assert_eq!(rerun.vote_count, 1);
    assert_eq!(rerun.revote_count, 0);

    // Only the owner may toggle visibility.
    toggle_hidden(&mut ledger, component, &owner, 0, false, false);

    let receipt = toggle_hidden(&mut ledger, component, &owner, 0, true, true);
    assert!(receipt
        .expect_commit_success()
        .application_events
        .iter()
        .any(|(identifier, _)| identifier.1 == "MajorityJudgmentElectionHiddenToggledEvent"));
    assert!(read_election(&mut ledger, component, 0).hidden);

    toggle_hidden(&mut ledger, component, &owner, 0, true, true);
    assert!(!read_election(&mut ledger, component, 0).hidden);
}
