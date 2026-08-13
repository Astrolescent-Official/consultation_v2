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

fn create_account(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
) -> TestAccount {
    let (public_key, _private_key, address) = ledger.new_allocated_account();
    TestAccount {
        address,
        public_key,
    }
}

fn create_owner(ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>) -> Owner {
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
            review_days: 1,
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

fn default_parameter_set() -> GovernanceParameterSetInput {
    GovernanceParameterSetInput {
        label: "Default".to_string(),
        parameters: standard_parameters(),
    }
}

fn majority_judgment_parameter_set(label: &str) -> GovernanceParameterSetInput {
    GovernanceParameterSetInput {
        label: label.to_string(),
        parameters: majority_judgment_parameters(),
    }
}

fn standard_draft() -> TemperatureCheckDraft {
    TemperatureCheckDraft {
        title: "Standard proposal".to_string(),
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

fn candidates() -> Vec<MajorityJudgmentCandidateInput> {
    vec![
        MajorityJudgmentCandidateInput {
            reference: "alice".to_string(),
            display_name: "Alice".to_string(),
            description: "Alice profile".to_string(),
            links: vec![Url::of("https://example.com/alice")],
        },
        MajorityJudgmentCandidateInput {
            reference: "bob".to_string(),
            display_name: "Bob".to_string(),
            description: "Bob profile".to_string(),
            links: vec![Url::of("https://example.com/bob")],
        },
        MajorityJudgmentCandidateInput {
            reference: "carol".to_string(),
            display_name: "Carol".to_string(),
            description: "Carol profile".to_string(),
            links: vec![Url::of("https://example.com/carol")],
        },
    ]
}

fn majority_judgment_draft() -> TemperatureCheckDraft {
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

fn instantiate(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    owner: &Owner,
    default: GovernanceParameterSetInput,
) -> ComponentAddress {
    let package = ledger.compile_and_publish(this_package!());
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package,
            "Governance",
            "instantiate",
            manifest_args!(owner.badge, default),
        )
        .build();
    ledger
        .execute_manifest(manifest, vec![])
        .expect_commit(true)
        .new_component_addresses()[0]
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

fn add_parameter_set(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
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

fn create_temperature_check(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
    author: &TestAccount,
    draft: TemperatureCheckDraft,
    parameter_set_id: &str,
    should_succeed: bool,
) {
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "make_temperature_check",
            manifest_args!(author.address, draft, Some(parameter_set_id.to_string())),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&author.public_key)],
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn advance_to(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    seconds_since_unix_epoch: i64,
) {
    let next_round = ledger.get_consensus_manager_state().round.number() + 1;
    ledger
        .advance_to_round_at_timestamp(Round::of(next_round), seconds_since_unix_epoch * 1000)
        .expect_commit_success();
}

fn create_election(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
    owner: &Owner,
    temperature_check_id: u64,
    review_start: Instant,
    candidate_order: Vec<MajorityJudgmentCandidateId>,
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
            manifest_args!(temperature_check_id, review_start, candidate_order),
        )
        .build();
    let signers = if authorized {
        owner_signers(owner)
    } else {
        vec![]
    };
    let receipt = ledger.execute_manifest(manifest, signers);
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
    receipt
}

fn vote(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
    voter: &TestAccount,
    round: MajorityJudgmentRoundId,
    grades: Vec<CandidateGrade>,
    signed: bool,
    should_succeed: bool,
) -> TransactionReceipt {
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "vote_on_majority_judgment_election",
            manifest_args!(voter.address, 0u64, round, grades),
        )
        .build();
    let signers = if signed {
        vec![NonFungibleGlobalId::from_public_key(&voter.public_key)]
    } else {
        vec![]
    };
    let receipt = ledger.execute_manifest(manifest, signers);
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
    receipt
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

fn election_from_ledger(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
) -> MajorityJudgmentElection {
    let state: GovernanceState = ledger.component_state(component);
    ledger
        .get_kv_store_entry(state.majority_judgment_elections, &0u64)
        .expect("election should exist")
}

#[test]
#[should_panic]
fn default_parameter_set_must_remain_standard() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    instantiate(
        &mut ledger,
        &owner,
        majority_judgment_parameter_set("Invalid default"),
    );
}

#[test]
fn majority_judgment_parameter_boundaries_are_enforced() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner, default_parameter_set());

    let mut expect_invalid = |id: &str, mutation: fn(&mut MajorityJudgmentParameters)| {
        let mut input = majority_judgment_parameter_set("Invalid");
        let GovernanceProcessParameters::MajorityJudgment { election, .. } = &mut input.parameters
        else {
            panic!("expected MJ parameters");
        };
        mutation(election);
        add_parameter_set(&mut ledger, component, &owner, id, input, false);
    };

    expect_invalid("zero-review", |parameters| parameters.review_days = 0);
    expect_invalid("zero-voting", |parameters| parameters.voting_days = 0);
    expect_invalid("zero-rerun-voting", |parameters| {
        parameters.rerun_voting_days = 0;
    });
    expect_invalid("zero-reserve", |parameters| {
        parameters.reserve_list_days = 0;
    });
    expect_invalid("zero-quorum", |parameters| {
        parameters.quorum = Decimal::ZERO
    });
    expect_invalid("zero-rerun-quorum", |parameters| {
        parameters.rerun_quorum = Decimal::ZERO;
    });
    expect_invalid("equal-rerun-quorum", |parameters| {
        parameters.rerun_quorum = parameters.quorum;
    });
    expect_invalid("lower-rerun-grade", |parameters| {
        parameters.rerun_minimum_median_grade = parameters.minimum_median_grade;
    });
}

#[test]
fn majority_judgment_candidate_count_boundaries_are_enforced() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner, default_parameter_set());
    let author = create_account(&mut ledger);
    add_parameter_set(
        &mut ledger,
        component,
        &owner,
        "election",
        majority_judgment_parameter_set("Permanent RAC"),
        true,
    );

    let make_candidates = |count: usize| {
        (0..count)
            .map(|index| MajorityJudgmentCandidateInput {
                reference: format!("candidate-{index}"),
                display_name: format!("Candidate {index}"),
                description: format!("Profile for candidate {index}"),
                links: vec![Url::of(format!("https://example.com/candidates/{index}"))],
            })
            .collect::<Vec<_>>()
    };
    let make_draft = |count: usize, seat_count: u32| TemperatureCheckDraft {
        title: format!("{count}-candidate election"),
        short_description: "Candidate boundary test".to_string(),
        description: "Candidate boundary test election".to_string(),
        links: vec![Url::of("https://example.com/election")],
        follow_up: TemperatureCheckFollowUpDraft::MajorityJudgmentElection {
            role_id: "permanent-rac".to_string(),
            seat_count,
            candidates: make_candidates(count),
        },
    };

    create_temperature_check(
        &mut ledger,
        component,
        &author,
        make_draft(1, 1),
        "election",
        false,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        make_draft(21, 2),
        "election",
        false,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        make_draft(2, 0),
        "election",
        false,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        make_draft(2, 2),
        "election",
        false,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        make_draft(2, 1),
        "election",
        true,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        make_draft(20, 2),
        "election",
        true,
    );
}

#[test]
fn parameter_variants_candidate_rules_and_snapshots_are_enforced() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner, default_parameter_set());
    let author = create_account(&mut ledger);

    add_parameter_set(
        &mut ledger,
        component,
        &owner,
        "election",
        majority_judgment_parameter_set("Permanent RAC"),
        true,
    );

    create_temperature_check(
        &mut ledger,
        component,
        &author,
        majority_judgment_draft(),
        "default",
        false,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        standard_draft(),
        "election",
        false,
    );

    let mut duplicate = majority_judgment_draft();
    if let TemperatureCheckFollowUpDraft::MajorityJudgmentElection { candidates, .. } =
        &mut duplicate.follow_up
    {
        candidates[2].reference = candidates[0].reference.clone();
    }
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        duplicate,
        "election",
        false,
    );

    let mut invalid_seats = majority_judgment_draft();
    if let TemperatureCheckFollowUpDraft::MajorityJudgmentElection { seat_count, .. } =
        &mut invalid_seats.follow_up
    {
        *seat_count = 3;
    }
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        invalid_seats,
        "election",
        false,
    );

    let mut invalid_candidate_url = majority_judgment_draft();
    if let TemperatureCheckFollowUpDraft::MajorityJudgmentElection { candidates, .. } =
        &mut invalid_candidate_url.follow_up
    {
        candidates[0].links = vec![Url::of("not a URL")];
    }
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        invalid_candidate_url,
        "election",
        false,
    );

    create_temperature_check(
        &mut ledger,
        component,
        &author,
        majority_judgment_draft(),
        "election",
        true,
    );

    let update_variant_manifest = owner_builder(&owner)
        .call_method(
            component,
            "update_governance_parameter_set",
            manifest_args!(
                "election".to_string(),
                GovernanceParameterSetInput {
                    label: "Wrong variant".to_string(),
                    parameters: standard_parameters(),
                }
            ),
        )
        .build();
    ledger
        .execute_manifest(update_variant_manifest, owner_signers(&owner))
        .expect_commit_failure();

    let update_default_manifest = owner_builder(&owner)
        .call_method(
            component,
            "update_governance_parameter_set",
            manifest_args!(
                "default".to_string(),
                majority_judgment_parameter_set("Wrong default")
            ),
        )
        .build();
    ledger
        .execute_manifest(update_default_manifest, owner_signers(&owner))
        .expect_commit_failure();

    let retirement_manifest = owner_builder(&owner)
        .call_method(
            component,
            "retire_governance_parameter_set",
            manifest_args!("election".to_string()),
        )
        .build();
    ledger
        .execute_manifest(retirement_manifest, owner_signers(&owner))
        .expect_commit_success();

    let state: GovernanceState = ledger.component_state(component);
    let temperature_check: TemperatureCheck = ledger
        .get_kv_store_entry(state.temperature_checks, &0u64)
        .expect("MJ temperature check should exist");
    assert_eq!(temperature_check.parameter_set.id, "election");
    assert_eq!(temperature_check.parameter_set.version, 1);
    match temperature_check.follow_up {
        TemperatureCheckFollowUp::MajorityJudgmentElection {
            role_id,
            seat_count,
            candidates,
        } => {
            assert_eq!(role_id, "permanent-rac");
            assert_eq!(seat_count, 2);
            assert_eq!(candidates.len(), 3);
            assert_eq!(candidates[0].id, MajorityJudgmentCandidateId(0));
            assert_eq!(candidates[2].reference, "carol");
        }
        TemperatureCheckFollowUp::StandardProposal { .. } => {
            panic!("expected an MJ continuation")
        }
    }
}

#[test]
fn election_creation_copies_commitment_and_enforces_owner_time_and_permutation() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner, default_parameter_set());
    let author = create_account(&mut ledger);
    add_parameter_set(
        &mut ledger,
        component,
        &owner,
        "election",
        majority_judgment_parameter_set("Permanent RAC"),
        true,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        majority_judgment_draft(),
        "election",
        true,
    );

    let order = vec![
        MajorityJudgmentCandidateId(2),
        MajorityJudgmentCandidateId(0),
        MajorityJudgmentCandidateId(1),
    ];
    create_election(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(86_400),
        order.clone(),
        true,
        false,
    );
    advance_to(&mut ledger, 86_400);
    create_election(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(86_400),
        order.clone(),
        false,
        false,
    );
    create_election(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(86_400),
        vec![
            MajorityJudgmentCandidateId(0),
            MajorityJudgmentCandidateId(0),
            MajorityJudgmentCandidateId(1),
        ],
        true,
        false,
    );
    let creation_receipt = create_election(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(86_400),
        order,
        true,
        true,
    );
    let (creation_identifier, creation_event_data) = creation_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "MajorityJudgmentElectionCreatedEvent")
        .expect("MJ creation event should be emitted");
    assert!(matches!(
        &creation_identifier.0,
        Emitter::Method(node_id, ModuleId::Main) if *node_id == component.into_node_id()
    ));
    let creation_event: MajorityJudgmentElectionCreatedEvent =
        scrypto_decode(creation_event_data).expect("MJ creation event should decode");
    assert_eq!(creation_event.election_id, 0);
    assert_eq!(creation_event.temperature_check_id, 0);
    assert_eq!(creation_event.role_id, "permanent-rac");
    assert_eq!(creation_event.seat_count, 2);
    assert_eq!(creation_event.snapshot, Instant::new(0));
    assert_eq!(creation_event.voting_start, Instant::new(172_800));
    assert_eq!(creation_event.voting_deadline, Instant::new(259_200));
    assert_eq!(creation_event.parameter_set_id, "election");
    assert_eq!(creation_event.parameter_set_version, 1);

    let state: GovernanceState = ledger.component_state(component);
    assert_eq!(state.majority_judgment_election_count, 1);
    let temperature_check: TemperatureCheck = ledger
        .get_kv_store_entry(state.temperature_checks, &0u64)
        .expect("temperature check should exist");
    assert_eq!(
        temperature_check.continuation,
        Some(ConsultationContinuation::MajorityJudgmentElection(0))
    );

    let election = election_from_ledger(&mut ledger, component);
    assert_eq!(election.temperature_check_id, 0);
    assert_eq!(election.author.address(), author.address);
    assert_eq!(election.role_id, "permanent-rac");
    assert_eq!(election.seat_count, 2);
    assert_eq!(election.parameter_set.id, "election");
    assert_eq!(election.parameter_set.version, 1);
    assert_eq!(election.round_one.snapshot, temperature_check.start);
    assert_eq!(election.review_start, Instant::new(86_400));
    assert_eq!(election.review_end, Instant::new(172_800));
    assert_eq!(election.round_one.start, election.review_end);
    assert_eq!(election.round_one.deadline, Instant::new(259_200));
    assert_eq!(election.candidates[0].display_order, 1);
    assert_eq!(election.candidates[1].display_order, 2);
    assert_eq!(election.candidates[2].display_order, 0);
    assert!(election.rerun.is_none());

    create_election(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(86_400),
        vec![
            MajorityJudgmentCandidateId(0),
            MajorityJudgmentCandidateId(1),
            MajorityJudgmentCandidateId(2),
        ],
        true,
        false,
    );
}

#[test]
fn complete_ballots_revote_rerun_tie_record_and_events_are_round_local() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let owner = create_owner(&mut ledger);
    let component = instantiate(&mut ledger, &owner, default_parameter_set());
    let author = create_account(&mut ledger);
    let voter = create_account(&mut ledger);
    add_parameter_set(
        &mut ledger,
        component,
        &owner,
        "election",
        majority_judgment_parameter_set("Permanent RAC"),
        true,
    );
    create_temperature_check(
        &mut ledger,
        component,
        &author,
        majority_judgment_draft(),
        "election",
        true,
    );
    advance_to(&mut ledger, 86_400);
    create_election(
        &mut ledger,
        component,
        &owner,
        0,
        Instant::new(86_400),
        vec![
            MajorityJudgmentCandidateId(0),
            MajorityJudgmentCandidateId(1),
            MajorityJudgmentCandidateId(2),
        ],
        true,
        true,
    );

    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        true,
        false,
    );
    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::Rerun,
        complete_ballot(),
        true,
        false,
    );
    advance_to(&mut ledger, 172_800);

    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot()[..2].to_vec(),
        true,
        false,
    );
    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        vec![
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(0),
                grade: Grade::Good,
            },
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(0),
                grade: Grade::Excellent,
            },
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(1),
                grade: Grade::Acceptable,
            },
        ],
        true,
        false,
    );
    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        vec![
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(0),
                grade: Grade::Good,
            },
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(1),
                grade: Grade::Acceptable,
            },
            CandidateGrade {
                candidate_id: MajorityJudgmentCandidateId(99),
                grade: Grade::Excellent,
            },
        ],
        true,
        false,
    );
    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        false,
        false,
    );

    let first_vote_receipt = vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        true,
        true,
    );
    let (first_vote_identifier, first_vote_event_data) = first_vote_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "MajorityJudgmentElectionVotedEvent")
        .expect("MJ vote event should be emitted");
    assert!(matches!(
        &first_vote_identifier.0,
        Emitter::Method(node_id, ModuleId::Main) if *node_id == component.into_node_id()
    ));
    let first_vote_event: MajorityJudgmentElectionVotedEvent =
        scrypto_decode(first_vote_event_data).expect("MJ vote event should decode");
    assert_eq!(first_vote_event.round, MajorityJudgmentRoundId::RoundOne);
    assert_eq!(first_vote_event.vote_id, 0);
    assert_eq!(first_vote_event.grades[0].candidate_id.0, 0);
    assert_eq!(first_vote_event.grades[1].candidate_id.0, 1);
    assert_eq!(first_vote_event.grades[2].candidate_id.0, 2);
    assert_eq!(first_vote_event.replacing_vote_id, None);

    let replacement = vec![
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(1),
            grade: Grade::Good,
        },
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(2),
            grade: Grade::Poor,
        },
        CandidateGrade {
            candidate_id: MajorityJudgmentCandidateId(0),
            grade: Grade::VeryGood,
        },
    ];
    let replacement_receipt = vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        replacement,
        true,
        true,
    );
    let (replacement_identifier, replacement_event_data) = replacement_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "MajorityJudgmentElectionVotedEvent")
        .expect("replacement event should be emitted");
    assert!(matches!(
        &replacement_identifier.0,
        Emitter::Method(node_id, ModuleId::Main) if *node_id == component.into_node_id()
    ));
    let replacement_event: MajorityJudgmentElectionVotedEvent =
        scrypto_decode(replacement_event_data).expect("replacement event should decode");
    assert_eq!(replacement_event.vote_id, 1);
    assert_eq!(replacement_event.replacing_vote_id, Some(0));

    let election = election_from_ledger(&mut ledger, component);
    assert_eq!(election.round_one.vote_count, 2);
    assert_eq!(election.round_one.revote_count, 1);
    let current_entry: MajorityJudgmentVoterEntry = ledger
        .get_kv_store_entry(election.round_one.voters.id, &voter.address)
        .expect("current round-one voter entry should exist");
    assert_eq!(current_entry.vote_id, 1);
    assert_eq!(current_entry.grades[0].candidate_id.0, 0);
    let first_record: MajorityJudgmentVoteRecord = ledger
        .get_kv_store_entry(election.round_one.votes.id, &0u64)
        .expect("first ballot record should remain auditable");
    assert_eq!(first_record.replacing_vote_id, None);

    let premature_rerun = owner_builder(&owner)
        .call_method(
            component,
            "start_majority_judgment_rerun",
            manifest_args!(0u64, Instant::new(172_800)),
        )
        .build();
    ledger
        .execute_manifest(premature_rerun, owner_signers(&owner))
        .expect_commit_failure();

    advance_to(&mut ledger, 259_200);
    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::RoundOne,
        complete_ballot(),
        true,
        false,
    );

    let unauthorized_rerun = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "start_majority_judgment_rerun",
            manifest_args!(0u64, Instant::new(259_200)),
        )
        .build();
    ledger
        .execute_manifest(unauthorized_rerun, vec![])
        .expect_commit_failure();

    let rerun_manifest = owner_builder(&owner)
        .call_method(
            component,
            "start_majority_judgment_rerun",
            manifest_args!(0u64, Instant::new(259_200)),
        )
        .build();
    let rerun_receipt = ledger.execute_manifest(rerun_manifest, owner_signers(&owner));
    let (rerun_identifier, rerun_event_data) = rerun_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "MajorityJudgmentRerunStartedEvent")
        .expect("rerun event should be emitted");
    assert!(matches!(
        &rerun_identifier.0,
        Emitter::Method(node_id, ModuleId::Main) if *node_id == component.into_node_id()
    ));
    let rerun_event: MajorityJudgmentRerunStartedEvent =
        scrypto_decode(rerun_event_data).expect("rerun event should decode");
    assert_eq!(rerun_event.snapshot, Instant::new(259_200));
    assert_eq!(rerun_event.quorum, dec!(2500));
    assert_eq!(rerun_event.minimum_median_grade, Grade::VeryGood);

    let duplicate_rerun = owner_builder(&owner)
        .call_method(
            component,
            "start_majority_judgment_rerun",
            manifest_args!(0u64, Instant::new(259_200)),
        )
        .build();
    ledger
        .execute_manifest(duplicate_rerun, owner_signers(&owner))
        .expect_commit_failure();

    vote(
        &mut ledger,
        component,
        &voter,
        MajorityJudgmentRoundId::Rerun,
        complete_ballot(),
        true,
        true,
    );
    let election = election_from_ledger(&mut ledger, component);
    let rerun = election.rerun.expect("rerun should exist");
    assert_eq!(rerun.snapshot, Instant::new(259_200));
    assert_eq!(rerun.vote_count, 1);
    assert_eq!(election.round_one.vote_count, 2);

    advance_to(&mut ledger, 345_600);
    let invalid_tie_manifest = owner_builder(&owner)
        .call_method(
            component,
            "record_majority_judgment_tie_resolution",
            manifest_args!(
                0u64,
                MajorityJudgmentRoundId::Rerun,
                vec![
                    MajorityJudgmentCandidateId(0),
                    MajorityJudgmentCandidateId(0)
                ]
            ),
        )
        .build();
    ledger
        .execute_manifest(invalid_tie_manifest, owner_signers(&owner))
        .expect_commit_failure();

    let tie_manifest = owner_builder(&owner)
        .call_method(
            component,
            "record_majority_judgment_tie_resolution",
            manifest_args!(
                0u64,
                MajorityJudgmentRoundId::Rerun,
                vec![
                    MajorityJudgmentCandidateId(2),
                    MajorityJudgmentCandidateId(0)
                ]
            ),
        )
        .build();
    let tie_receipt = ledger.execute_manifest(tie_manifest, owner_signers(&owner));
    let (tie_identifier, tie_event_data) = tie_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "MajorityJudgmentTieResolutionRecordedEvent")
        .expect("tie event should be emitted");
    assert!(matches!(
        &tie_identifier.0,
        Emitter::Method(node_id, ModuleId::Main) if *node_id == component.into_node_id()
    ));
    let tie_event: MajorityJudgmentTieResolutionRecordedEvent =
        scrypto_decode(tie_event_data).expect("tie event should decode");
    assert_eq!(tie_event.round, MajorityJudgmentRoundId::Rerun);
    assert_eq!(
        tie_event.ordered_candidate_ids,
        vec![
            MajorityJudgmentCandidateId(2),
            MajorityJudgmentCandidateId(0)
        ]
    );

    let second_tie_manifest = owner_builder(&owner)
        .call_method(
            component,
            "record_majority_judgment_tie_resolution",
            manifest_args!(
                0u64,
                MajorityJudgmentRoundId::Rerun,
                vec![
                    MajorityJudgmentCandidateId(0),
                    MajorityJudgmentCandidateId(2)
                ]
            ),
        )
        .build();
    ledger
        .execute_manifest(second_tie_manifest, owner_signers(&owner))
        .expect_commit_failure();

    let unauthorized_toggle = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "toggle_majority_judgment_election_hidden",
            manifest_args!(0u64),
        )
        .build();
    ledger
        .execute_manifest(unauthorized_toggle, vec![])
        .expect_commit_failure();

    let toggle_manifest = owner_builder(&owner)
        .call_method(
            component,
            "toggle_majority_judgment_election_hidden",
            manifest_args!(0u64),
        )
        .build();
    let toggle_receipt = ledger.execute_manifest(toggle_manifest, owner_signers(&owner));
    let (toggle_identifier, toggle_event_data) = toggle_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "MajorityJudgmentElectionHiddenToggledEvent")
        .expect("visibility event should be emitted");
    assert!(matches!(
        &toggle_identifier.0,
        Emitter::Method(node_id, ModuleId::Main) if *node_id == component.into_node_id()
    ));
    let toggle_event: MajorityJudgmentElectionHiddenToggledEvent =
        scrypto_decode(toggle_event_data).expect("visibility event should decode");
    assert_eq!(toggle_event.election_id, 0);
    assert!(toggle_event.hidden);
    assert!(election_from_ledger(&mut ledger, component).hidden);
}
