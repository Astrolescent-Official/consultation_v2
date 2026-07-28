use consultation_blueprint::*;
use scrypto::prelude::Url;
use scrypto_test::prelude::*;

// =============================================================================
// Test Helpers
// =============================================================================

/// Creates an owner badge and deposits it to a new account
/// Returns (badge_address, owner_account, owner_public_key)
fn create_owner_badge_with_account(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
) -> (ResourceAddress, ComponentAddress, Secp256k1PublicKey) {
    let (public_key, _private_key, owner_account) = ledger.new_allocated_account();

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
        .try_deposit_entire_worktop_or_abort(owner_account, None)
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&public_key)],
    );
    receipt.expect_commit_success();
    let owner_badge = receipt.expect_commit(true).new_resource_addresses()[0];

    (owner_badge, owner_account, public_key)
}

fn create_governance_parameters() -> GovernanceParameterSetInput {
    GovernanceParameterSetInput {
        label: "Default".to_string(),
        parameters: GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 7,
                quorum: dec!(1000),
                approval_threshold: dec!("0.5"),
            },
            proposal: StandardProposalParameters {
                voting_days: 14,
                quorum: dec!(5000),
                approval_threshold: dec!("0.5"),
            },
        },
    }
}

fn create_temp_check_draft() -> TemperatureCheckDraft {
    TemperatureCheckDraft {
        title: "Test Proposal".to_string(),
        short_description: "A short summary of the test proposal".to_string(),
        description: "# Test Proposal\n\nA full markdown description of the test proposal."
            .to_string(),
        links: vec![Url::of("https://radixtalk.com/proposal/123")],
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

fn create_multi_choice_temp_check_draft() -> TemperatureCheckDraft {
    TemperatureCheckDraft {
        title: "Multi-Choice Test Proposal".to_string(),
        short_description: "A short summary of the multi-choice proposal".to_string(),
        description:
            "# Multi-Choice Proposal\n\nA full markdown description with multiple choice voting."
                .to_string(),
        links: vec![Url::of("https://radixtalk.com/proposal/456")],
        follow_up: TemperatureCheckFollowUpDraft::StandardProposal {
            vote_options: vec![
                ProposalVoteOptionInput {
                    label: "Option A".to_string(),
                },
                ProposalVoteOptionInput {
                    label: "Option B".to_string(),
                },
                ProposalVoteOptionInput {
                    label: "Option C".to_string(),
                },
            ],
            max_selections: Some(2),
        },
    }
}

fn advance_by_days(ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>, days: i64) {
    let next_round = ledger.get_consensus_manager_state().round.number() + 1;
    let timestamp = ledger.get_current_proposer_timestamp_ms() + days * 24 * 60 * 60 * 1000;
    ledger
        .advance_to_round_at_timestamp(Round::of(next_round), timestamp)
        .expect_commit_success();
}

// =============================================================================
// Governance Blueprint Tests
// =============================================================================

#[test]
fn test_governance_instantiate() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _public_key) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();

    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            ledger.compile_and_publish(this_package!()),
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    receipt.expect_commit_success();
}

#[test]
fn test_make_temperature_check() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _public_key) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();
    let package_address = ledger.compile_and_publish(this_package!());

    // Create author account
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    // Instantiate governance
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    receipt.expect_commit_success();
    let governance_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Create temperature check
    let draft = create_temp_check_draft();
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "make_temperature_check",
            manifest_args!(author_account, draft, Option::<String>::None),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&author_pk)],
    );
    receipt.expect_commit_success();

    // Verify counter increased
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "get_temperature_check_count",
            manifest_args!(),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let count: u64 = receipt.expect_commit_success().output(1);
    assert_eq!(count, 1);
}

#[test]
fn test_vote_on_temperature_check() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _owner_pk) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();
    let package_address = ledger.compile_and_publish(this_package!());

    // Create author account
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    // Create voter account
    let (public_key, _private_key, account) = ledger.new_allocated_account();

    // Instantiate governance
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let governance_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Create temperature check
    let draft = create_temp_check_draft();
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "make_temperature_check",
            manifest_args!(author_account, draft, Option::<String>::None),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&author_pk)],
        )
        .expect_commit_success();

    // Vote on temperature check
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "vote_on_temperature_check",
            manifest_args!(account, 0u64, TemperatureCheckVote::For),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&public_key)],
    );
    receipt.expect_commit_success();
}

#[test]
fn test_temperature_check_revote_replaces_the_current_vote() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _owner_pk) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();
    let package_address = ledger.compile_and_publish(this_package!());

    // Create author account
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    // Create voter account
    let (public_key, _private_key, account) = ledger.new_allocated_account();

    // Instantiate governance
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let governance_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Create temperature check
    let draft = create_temp_check_draft();
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "make_temperature_check",
            manifest_args!(author_account, draft, Option::<String>::None),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&author_pk)],
        )
        .expect_commit_success();

    // First vote should succeed
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "vote_on_temperature_check",
            manifest_args!(account, 0u64, TemperatureCheckVote::For),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&public_key)],
        )
        .expect_commit_success();

    // A second vote succeeds as a revote and supersedes the current voter entry.
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "vote_on_temperature_check",
            manifest_args!(account, 0u64, TemperatureCheckVote::Against),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&public_key)],
        )
        .expect_commit_success();

    let state: GovernanceState = ledger.component_state(governance_component);
    let temperature_check: TemperatureCheck = ledger
        .get_kv_store_entry(state.temperature_checks, &0u64)
        .expect("temperature check should exist");
    assert_eq!(temperature_check.vote_count, 2);
    assert_eq!(temperature_check.revote_count, 1);
}

#[test]
fn test_make_proposal_from_temperature_check() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let package_address = ledger.compile_and_publish(this_package!());

    // Create owner account with badge
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();

    // Create author account
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    // Instantiate governance
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let governance_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Create temperature check
    let draft = create_temp_check_draft();
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "make_temperature_check",
            manifest_args!(author_account, draft, Option::<String>::None),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&author_pk)],
        )
        .expect_commit_success();

    // Elevate to proposal after the temperature check closes.
    advance_by_days(&mut ledger, 30);
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(governance_component, "make_proposal", manifest_args!(0u64))
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
    );
    receipt.expect_commit_success();

    // Verify proposal was created
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(governance_component, "get_proposal_count", manifest_args!())
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let count: u64 = receipt.expect_commit_success().output(1);
    assert_eq!(count, 1);
}

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

fn instantiate_governance(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    owner_badge: ResourceAddress,
    default_parameter_set: GovernanceParameterSetInput,
) -> ComponentAddress {
    let package_address = ledger.compile_and_publish(this_package!());
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, default_parameter_set),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    receipt.expect_commit(true).new_component_addresses()[0]
}

fn parameter_set_input(
    label: &str,
    temperature_check_days: u32,
    proposal_length_days: u32,
) -> GovernanceParameterSetInput {
    GovernanceParameterSetInput {
        label: label.to_string(),
        parameters: GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: temperature_check_days,
                quorum: dec!(1000),
                approval_threshold: dec!("0.6"),
            },
            proposal: StandardProposalParameters {
                voting_days: proposal_length_days,
                quorum: dec!(5000),
                approval_threshold: dec!("0.7"),
            },
        },
    }
}

fn standard_temperature_check_parameters(
    parameters: &GovernanceProcessParameters,
) -> &TemperatureCheckParameters {
    match parameters {
        GovernanceProcessParameters::Standard {
            temperature_check, ..
        } => temperature_check,
        GovernanceProcessParameters::MajorityJudgment { .. } => {
            panic!("expected Standard parameters")
        }
    }
}

fn standard_proposal_parameters(
    parameters: &GovernanceProcessParameters,
) -> &StandardProposalParameters {
    match parameters {
        GovernanceProcessParameters::Standard { proposal, .. } => proposal,
        GovernanceProcessParameters::MajorityJudgment { .. } => {
            panic!("expected Standard parameters")
        }
    }
}

fn add_parameter_set(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
    owner_account: ComponentAddress,
    owner_badge: ResourceAddress,
    owner_pk: Secp256k1PublicKey,
    id: &str,
    input: GovernanceParameterSetInput,
    authorized: bool,
    should_succeed: bool,
) {
    let builder = ManifestBuilder::new().lock_fee_from_faucet();
    let builder = if authorized {
        builder.create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
    } else {
        builder
    };
    let manifest = builder
        .call_method(
            component,
            "add_governance_parameter_set",
            manifest_args!(id.to_string(), input),
        )
        .build();
    let signers = if authorized {
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)]
    } else {
        vec![]
    };
    let receipt = ledger.execute_manifest(manifest, signers);
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn update_parameter_set(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
    owner_account: ComponentAddress,
    owner_badge: ResourceAddress,
    owner_pk: Secp256k1PublicKey,
    id: &str,
    input: GovernanceParameterSetInput,
    should_succeed: bool,
) {
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(
            component,
            "update_governance_parameter_set",
            manifest_args!(id.to_string(), input),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn retire_parameter_set(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
    owner_account: ComponentAddress,
    owner_badge: ResourceAddress,
    owner_pk: Secp256k1PublicKey,
    id: &str,
    should_succeed: bool,
) {
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(
            component,
            "retire_governance_parameter_set",
            manifest_args!(id.to_string()),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

fn make_temperature_check_with_parameter_set(
    ledger: &mut LedgerSimulator<NoExtension, InMemorySubstateDatabase>,
    component: ComponentAddress,
    author_account: ComponentAddress,
    author_pk: Secp256k1PublicKey,
    parameter_set_id: Option<String>,
    should_succeed: bool,
) {
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "make_temperature_check",
            manifest_args!(author_account, create_temp_check_draft(), parameter_set_id),
        )
        .build();
    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&author_pk)],
    );
    if should_succeed {
        receipt.expect_commit_success();
    } else {
        receipt.expect_commit_failure();
    }
}

#[test]
fn test_named_parameter_set_registry_lifecycle_and_authorization() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let component =
        instantiate_governance(&mut ledger, owner_badge, create_governance_parameters());

    let state: GovernanceState = ledger.component_state(component);
    let default_record: GovernanceParameterSet = ledger
        .get_kv_store_entry(state.parameter_sets, &"default".to_string())
        .expect("default parameter set should be created");
    assert_eq!(default_record.label, "Default");
    assert_eq!(default_record.version, 1);
    assert!(!default_record.retired);

    add_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "constitutional",
        parameter_set_input("Constitutional", 10, 20),
        false,
        false,
    );

    let (wrong_badge, wrong_account, wrong_pk) = create_owner_badge_with_account(&mut ledger);
    let wrong_proof_manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(wrong_account, wrong_badge, dec!(1))
        .call_method(
            component,
            "add_governance_parameter_set",
            manifest_args!(
                "wrong-proof".to_string(),
                parameter_set_input("Wrong proof", 10, 20)
            ),
        )
        .build();
    ledger
        .execute_manifest(
            wrong_proof_manifest,
            vec![NonFungibleGlobalId::from_public_key(&wrong_pk)],
        )
        .expect_commit_failure();

    add_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "constitutional",
        parameter_set_input("Constitutional", 10, 20),
        true,
        true,
    );

    let update_without_proof = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "update_governance_parameter_set",
            manifest_args!(
                "constitutional".to_string(),
                parameter_set_input("Unauthorized update", 10, 20)
            ),
        )
        .build();
    ledger
        .execute_manifest(update_without_proof, vec![])
        .expect_commit_failure();

    let update_with_wrong_proof = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(wrong_account, wrong_badge, dec!(1))
        .call_method(
            component,
            "update_governance_parameter_set",
            manifest_args!(
                "constitutional".to_string(),
                parameter_set_input("Wrong proof update", 10, 20)
            ),
        )
        .build();
    ledger
        .execute_manifest(
            update_with_wrong_proof,
            vec![NonFungibleGlobalId::from_public_key(&wrong_pk)],
        )
        .expect_commit_failure();

    let retire_without_proof = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "retire_governance_parameter_set",
            manifest_args!("constitutional".to_string()),
        )
        .build();
    ledger
        .execute_manifest(retire_without_proof, vec![])
        .expect_commit_failure();

    let retire_with_wrong_proof = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(wrong_account, wrong_badge, dec!(1))
        .call_method(
            component,
            "retire_governance_parameter_set",
            manifest_args!("constitutional".to_string()),
        )
        .build();
    ledger
        .execute_manifest(
            retire_with_wrong_proof,
            vec![NonFungibleGlobalId::from_public_key(&wrong_pk)],
        )
        .expect_commit_failure();

    update_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "constitutional",
        parameter_set_input("Constitutional v2", 11, 21),
        true,
    );

    let state: GovernanceState = ledger.component_state(component);
    let updated: GovernanceParameterSet = ledger
        .get_kv_store_entry(state.parameter_sets, &"constitutional".to_string())
        .expect("updated parameter set should exist");
    assert_eq!(updated.version, 2);
    assert_eq!(updated.label, "Constitutional v2");

    retire_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "constitutional",
        true,
    );
    retire_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "constitutional",
        false,
    );
    update_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "constitutional",
        parameter_set_input("Cannot edit retired", 12, 22),
        false,
    );
    add_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "constitutional",
        parameter_set_input("Cannot reuse", 12, 22),
        true,
        false,
    );
    retire_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "default",
        false,
    );
    update_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "missing",
        parameter_set_input("Missing", 12, 22),
        false,
    );
    retire_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "missing",
        false,
    );

    let state: GovernanceState = ledger.component_state(component);
    let retired: GovernanceParameterSet = ledger
        .get_kv_store_entry(state.parameter_sets, &"constitutional".to_string())
        .expect("retired record should remain in the registry");
    assert!(retired.retired);
    assert_eq!(retired.version, 2);
}

#[test]
fn test_named_parameter_set_validation_and_boundaries() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let component =
        instantiate_governance(&mut ledger, owner_badge, create_governance_parameters());

    for invalid_id in [
        "",
        "Uppercase",
        "non-ascii-é",
        "-leading",
        "trailing-",
        "consecutive--hyphen",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ] {
        add_parameter_set(
            &mut ledger,
            component,
            owner_account,
            owner_badge,
            owner_pk,
            invalid_id,
            parameter_set_input("Valid label", 1, 1),
            true,
            false,
        );
    }

    add_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parameter_set_input(&"x".repeat(128), 1, 1),
        true,
        true,
    );

    for (id, label) in [
        ("empty-label", ""),
        ("blank-label", "   "),
        ("leading-space-label", " Leading"),
        ("trailing-space-label", "Trailing "),
    ] {
        add_parameter_set(
            &mut ledger,
            component,
            owner_account,
            owner_badge,
            owner_pk,
            id,
            parameter_set_input(label, 1, 1),
            true,
            false,
        );
    }
    add_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "overlong-label",
        parameter_set_input(&"x".repeat(129), 1, 1),
        true,
        false,
    );

    let invalid_parameters = [
        GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 0,
                quorum: dec!(1000),
                approval_threshold: dec!("0.6"),
            },
            proposal: StandardProposalParameters {
                voting_days: 1,
                quorum: dec!(5000),
                approval_threshold: dec!("0.7"),
            },
        },
        GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 1,
                quorum: Decimal::ZERO,
                approval_threshold: dec!("0.6"),
            },
            proposal: StandardProposalParameters {
                voting_days: 1,
                quorum: dec!(5000),
                approval_threshold: dec!("0.7"),
            },
        },
        GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 1,
                quorum: dec!(1000),
                approval_threshold: Decimal::ZERO,
            },
            proposal: StandardProposalParameters {
                voting_days: 1,
                quorum: dec!(5000),
                approval_threshold: dec!("0.7"),
            },
        },
        GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 1,
                quorum: dec!(1000),
                approval_threshold: dec!("0.6"),
            },
            proposal: StandardProposalParameters {
                voting_days: 0,
                quorum: dec!(5000),
                approval_threshold: dec!("0.7"),
            },
        },
        GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 1,
                quorum: dec!(1000),
                approval_threshold: dec!("0.6"),
            },
            proposal: StandardProposalParameters {
                voting_days: 1,
                quorum: Decimal::ZERO,
                approval_threshold: dec!("0.7"),
            },
        },
        GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 1,
                quorum: dec!(1000),
                approval_threshold: dec!("0.6"),
            },
            proposal: StandardProposalParameters {
                voting_days: 1,
                quorum: dec!(5000),
                approval_threshold: dec!("1.01"),
            },
        },
    ];
    for (index, parameters) in invalid_parameters.into_iter().enumerate() {
        add_parameter_set(
            &mut ledger,
            component,
            owner_account,
            owner_badge,
            owner_pk,
            &format!("invalid-parameters-{index}"),
            GovernanceParameterSetInput {
                label: "Invalid".to_string(),
                parameters,
            },
            true,
            false,
        );
    }

    update_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "default",
        GovernanceParameterSetInput {
            label: "Default".to_string(),
            parameters: GovernanceProcessParameters::Standard {
                temperature_check: TemperatureCheckParameters {
                    voting_days: 1,
                    quorum: dec!(1000),
                    approval_threshold: dec!("0.6"),
                },
                proposal: StandardProposalParameters {
                    voting_days: 1,
                    quorum: dec!(5000),
                    approval_threshold: dec!("1.01"),
                },
            },
        },
        false,
    );

    let invalid_default = GovernanceParameterSetInput {
        label: "Default".to_string(),
        parameters: GovernanceProcessParameters::Standard {
            temperature_check: TemperatureCheckParameters {
                voting_days: 0,
                quorum: dec!(1000),
                approval_threshold: dec!("0.6"),
            },
            proposal: StandardProposalParameters {
                voting_days: 1,
                quorum: dec!(5000),
                approval_threshold: dec!("0.7"),
            },
        },
    };
    let package_address = ledger.compile_and_publish(this_package!());
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, invalid_default),
        )
        .build();
    ledger
        .execute_manifest(manifest, vec![])
        .expect_commit_failure();
}

#[test]
fn test_parameter_set_selection_and_default_resolution() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let component =
        instantiate_governance(&mut ledger, owner_badge, create_governance_parameters());
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    make_temperature_check_with_parameter_set(
        &mut ledger,
        component,
        author_account,
        author_pk,
        None,
        true,
    );
    make_temperature_check_with_parameter_set(
        &mut ledger,
        component,
        author_account,
        author_pk,
        Some("default".to_string()),
        true,
    );
    make_temperature_check_with_parameter_set(
        &mut ledger,
        component,
        author_account,
        author_pk,
        Some("unknown".to_string()),
        false,
    );

    add_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "treasury-budget",
        parameter_set_input("Treasury / Budget", 9, 18),
        true,
        true,
    );
    retire_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "treasury-budget",
        true,
    );
    make_temperature_check_with_parameter_set(
        &mut ledger,
        component,
        author_account,
        author_pk,
        Some("treasury-budget".to_string()),
        false,
    );

    let state: GovernanceState = ledger.component_state(component);
    let none_tc: TemperatureCheck = ledger
        .get_kv_store_entry(state.temperature_checks, &0u64)
        .expect("TC created with None should exist");
    let explicit_default_tc: TemperatureCheck = ledger
        .get_kv_store_entry(state.temperature_checks, &1u64)
        .expect("TC created with Some(default) should exist");
    assert_eq!(none_tc.parameter_set.id, "default");
    assert_eq!(explicit_default_tc.parameter_set.id, "default");
    assert_eq!(none_tc.parameter_set.version, 1);
    assert_eq!(explicit_default_tc.parameter_set.version, 1);
    assert_eq!(
        standard_temperature_check_parameters(&none_tc.parameter_set.parameters).quorum,
        standard_temperature_check_parameters(&explicit_default_tc.parameter_set.parameters).quorum
    );
    assert_eq!(
        none_tc.deadline.seconds_since_unix_epoch - none_tc.start.seconds_since_unix_epoch,
        explicit_default_tc.deadline.seconds_since_unix_epoch
            - explicit_default_tc.start.seconds_since_unix_epoch
    );
}

#[test]
fn test_parameter_set_snapshot_is_immutable_through_edit_retirement_and_elevation() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let component =
        instantiate_governance(&mut ledger, owner_badge, create_governance_parameters());
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    add_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "executable",
        parameter_set_input("Executable", 3, 5),
        true,
        true,
    );
    make_temperature_check_with_parameter_set(
        &mut ledger,
        component,
        author_account,
        author_pk,
        Some("executable".to_string()),
        true,
    );
    update_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "executable",
        parameter_set_input("Executable revised", 7, 11),
        true,
    );
    make_temperature_check_with_parameter_set(
        &mut ledger,
        component,
        author_account,
        author_pk,
        Some("executable".to_string()),
        true,
    );
    retire_parameter_set(
        &mut ledger,
        component,
        owner_account,
        owner_badge,
        owner_pk,
        "executable",
        true,
    );

    advance_by_days(&mut ledger, 30);
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(component, "make_proposal", manifest_args!(0u64))
        .build();
    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
        )
        .expect_commit_success();

    let state: GovernanceState = ledger.component_state(component);
    let version_one_tc: TemperatureCheck = ledger
        .get_kv_store_entry(state.temperature_checks, &0u64)
        .expect("version 1 TC should exist");
    let version_two_tc: TemperatureCheck = ledger
        .get_kv_store_entry(state.temperature_checks, &1u64)
        .expect("version 2 TC should exist");
    let proposal: Proposal = ledger
        .get_kv_store_entry(state.proposals, &0u64)
        .expect("proposal should exist");
    let registry_record: GovernanceParameterSet = ledger
        .get_kv_store_entry(state.parameter_sets, &"executable".to_string())
        .expect("retired registry record should remain");

    assert_eq!(version_one_tc.parameter_set.version, 1);
    assert_eq!(version_one_tc.parameter_set.label, "Executable");
    assert_eq!(
        standard_temperature_check_parameters(&version_one_tc.parameter_set.parameters).voting_days,
        3
    );
    assert_eq!(version_two_tc.parameter_set.version, 2);
    assert_eq!(version_two_tc.parameter_set.label, "Executable revised");
    assert_eq!(
        standard_temperature_check_parameters(&version_two_tc.parameter_set.parameters).voting_days,
        7
    );
    assert_eq!(proposal.parameter_set.id, version_one_tc.parameter_set.id);
    assert_eq!(
        proposal.parameter_set.version,
        version_one_tc.parameter_set.version
    );
    assert_eq!(
        standard_proposal_parameters(&proposal.parameter_set.parameters).voting_days,
        standard_proposal_parameters(&version_one_tc.parameter_set.parameters).voting_days
    );
    assert_eq!(
        proposal.deadline.seconds_since_unix_epoch - proposal.start.seconds_since_unix_epoch,
        5 * 24 * 60 * 60
    );
    assert!(registry_record.retired);
    assert_eq!(registry_record.version, 2);
}

#[test]
fn test_parameter_set_and_consultation_events_include_identity_and_version() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let component =
        instantiate_governance(&mut ledger, owner_badge, create_governance_parameters());
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    let add_manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(
            component,
            "add_governance_parameter_set",
            manifest_args!(
                "governance-process".to_string(),
                parameter_set_input("Governance process", 4, 8)
            ),
        )
        .build();
    let add_receipt = ledger.execute_manifest(
        add_manifest,
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
    );
    let add_event_data = add_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "GovernanceParameterSetAddedEvent")
        .map(|(_, data)| data)
        .expect("added event should be emitted");
    let add_event: GovernanceParameterSetAddedEvent =
        scrypto_decode(add_event_data).expect("added event should decode");
    assert_eq!(add_event.parameter_set_id, "governance-process");
    assert_eq!(add_event.parameter_set.version, 1);

    let tc_manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            component,
            "make_temperature_check",
            manifest_args!(
                author_account,
                create_temp_check_draft(),
                Some("governance-process".to_string())
            ),
        )
        .build();
    let tc_receipt = ledger.execute_manifest(
        tc_manifest,
        vec![NonFungibleGlobalId::from_public_key(&author_pk)],
    );
    let tc_event_data = tc_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "TemperatureCheckCreatedEvent")
        .map(|(_, data)| data)
        .expect("TC creation event should be emitted");
    let tc_event: TemperatureCheckCreatedEvent =
        scrypto_decode(tc_event_data).expect("TC creation event should decode");
    assert_eq!(tc_event.parameter_set_id, "governance-process");
    assert_eq!(tc_event.parameter_set_version, 1);

    advance_by_days(&mut ledger, 30);
    let proposal_manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(component, "make_proposal", manifest_args!(0u64))
        .build();
    let proposal_receipt = ledger.execute_manifest(
        proposal_manifest,
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
    );
    let proposal_event_data = proposal_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "ProposalCreatedEvent")
        .map(|(_, data)| data)
        .expect("proposal creation event should be emitted");
    let proposal_event: ProposalCreatedEvent =
        scrypto_decode(proposal_event_data).expect("proposal creation event should decode");
    assert_eq!(proposal_event.parameter_set_id, "governance-process");
    assert_eq!(proposal_event.parameter_set_version, 1);

    let update_manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(
            component,
            "update_governance_parameter_set",
            manifest_args!(
                "governance-process".to_string(),
                parameter_set_input("Governance process v2", 5, 9)
            ),
        )
        .build();
    let update_receipt = ledger.execute_manifest(
        update_manifest,
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
    );
    let update_event_data = update_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "GovernanceParameterSetUpdatedEvent")
        .map(|(_, data)| data)
        .expect("updated event should be emitted");
    let update_event: GovernanceParameterSetUpdatedEvent =
        scrypto_decode(update_event_data).expect("updated event should decode");
    assert_eq!(update_event.parameter_set_id, "governance-process");
    assert_eq!(update_event.previous_version, 1);
    assert_eq!(update_event.parameter_set.version, 2);

    let retire_manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(
            component,
            "retire_governance_parameter_set",
            manifest_args!("governance-process".to_string()),
        )
        .build();
    let retire_receipt = ledger.execute_manifest(
        retire_manifest,
        vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
    );
    let retire_event_data = retire_receipt
        .expect_commit_success()
        .application_events
        .iter()
        .find(|(identifier, _)| identifier.1 == "GovernanceParameterSetRetiredEvent")
        .map(|(_, data)| data)
        .expect("retired event should be emitted");
    let retire_event: GovernanceParameterSetRetiredEvent =
        scrypto_decode(retire_event_data).expect("retired event should decode");
    assert_eq!(retire_event.parameter_set_id, "governance-process");
    assert_eq!(retire_event.version, 2);
}

// =============================================================================
// VoteDelegation Blueprint Tests
// =============================================================================

#[test]
fn test_vote_delegation_instantiate() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _public_key) = create_owner_badge_with_account(&mut ledger);

    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            ledger.compile_and_publish(this_package!()),
            "VoteDelegation",
            "instantiate",
            manifest_args!(owner_badge),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    receipt.expect_commit_success();
}

#[test]
fn test_make_delegation() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _owner_pk) = create_owner_badge_with_account(&mut ledger);
    let package_address = ledger.compile_and_publish(this_package!());

    // Create delegator and delegatee accounts
    let (delegator_pk, _delegator_sk, delegator_account) = ledger.new_allocated_account();
    let (_delegatee_pk, _delegatee_sk, delegatee_account) = ledger.new_allocated_account();

    // Instantiate vote delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "VoteDelegation",
            "instantiate",
            manifest_args!(owner_badge),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let delegation_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Set valid_until to future time
    let valid_until = Instant::new(i64::MAX / 2);

    // Make delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "make_delegation",
            manifest_args!(
                delegator_account,
                delegatee_account,
                dec!("0.5"),
                valid_until
            ),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
    );
    receipt.expect_commit_success();

    // Verify delegation exists by checking via get_delegatee_delegators
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "get_delegatee_delegators",
            manifest_args!(delegatee_account, delegator_account),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let fraction: Option<Decimal> = receipt.expect_commit_success().output(1);
    assert_eq!(fraction, Some(dec!("0.5")));
}

#[test]
fn test_remove_delegation() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _owner_pk) = create_owner_badge_with_account(&mut ledger);
    let package_address = ledger.compile_and_publish(this_package!());

    // Create delegator and delegatee accounts
    let (delegator_pk, _delegator_sk, delegator_account) = ledger.new_allocated_account();
    let (_delegatee_pk, _delegatee_sk, delegatee_account) = ledger.new_allocated_account();

    // Instantiate vote delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "VoteDelegation",
            "instantiate",
            manifest_args!(owner_badge),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let delegation_component = receipt.expect_commit(true).new_component_addresses()[0];

    let valid_until = Instant::new(i64::MAX / 2);

    // Make delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "make_delegation",
            manifest_args!(
                delegator_account,
                delegatee_account,
                dec!("0.5"),
                valid_until
            ),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
        )
        .expect_commit_success();

    // Remove delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "remove_delegation",
            manifest_args!(delegator_account, delegatee_account),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
    );
    receipt.expect_commit_success();

    // Verify delegation was removed
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "get_delegatee_delegators",
            manifest_args!(delegatee_account, delegator_account),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let fraction: Option<Decimal> = receipt.expect_commit_success().output(1);
    assert_eq!(fraction, None);
}

#[test]
fn test_cannot_delegate_more_than_100_percent() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _owner_pk) = create_owner_badge_with_account(&mut ledger);
    let package_address = ledger.compile_and_publish(this_package!());

    // Create accounts
    let (delegator_pk, _delegator_sk, delegator_account) = ledger.new_allocated_account();
    let (_delegatee1_pk, _delegatee1_sk, delegatee1_account) = ledger.new_allocated_account();
    let (_delegatee2_pk, _delegatee2_sk, delegatee2_account) = ledger.new_allocated_account();

    // Instantiate vote delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "VoteDelegation",
            "instantiate",
            manifest_args!(owner_badge),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let delegation_component = receipt.expect_commit(true).new_component_addresses()[0];

    let valid_until = Instant::new(i64::MAX / 2);

    // First delegation of 60%
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "make_delegation",
            manifest_args!(
                delegator_account,
                delegatee1_account,
                dec!("0.6"),
                valid_until
            ),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
        )
        .expect_commit_success();

    // Second delegation of 50% should fail (60% + 50% > 100%)
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "make_delegation",
            manifest_args!(
                delegator_account,
                delegatee2_account,
                dec!("0.5"),
                valid_until
            ),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
    );
    receipt.expect_commit_failure();
}

#[test]
fn test_cannot_delegate_to_self() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _owner_pk) = create_owner_badge_with_account(&mut ledger);
    let package_address = ledger.compile_and_publish(this_package!());

    // Create account
    let (delegator_pk, _delegator_sk, delegator_account) = ledger.new_allocated_account();

    // Instantiate vote delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "VoteDelegation",
            "instantiate",
            manifest_args!(owner_badge),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let delegation_component = receipt.expect_commit(true).new_component_addresses()[0];

    let valid_until = Instant::new(i64::MAX / 2);

    // Try to delegate to self
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "make_delegation",
            manifest_args!(
                delegator_account,
                delegator_account,
                dec!("0.5"),
                valid_until
            ),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
    );
    receipt.expect_commit_failure();
}

// =============================================================================
// Multiple Choice Voting Tests
// =============================================================================

#[test]
fn test_multi_choice_proposal_voting() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let package_address = ledger.compile_and_publish(this_package!());
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();

    // Create author account
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    // Create voter account
    let (voter_pk, _voter_sk, voter_account) = ledger.new_allocated_account();

    // Instantiate governance
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let governance_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Create multi-choice temperature check
    let draft = create_multi_choice_temp_check_draft();
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "make_temperature_check",
            manifest_args!(author_account, draft, Option::<String>::None),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&author_pk)],
        )
        .expect_commit_success();

    // Elevate to proposal after the temperature check closes.
    advance_by_days(&mut ledger, 30);
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(governance_component, "make_proposal", manifest_args!(0u64))
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
        )
        .expect_commit_success();

    // Vote with multiple selections (should succeed - selecting 2 options, max is 2)
    let votes: Vec<ProposalVoteOptionId> = vec![ProposalVoteOptionId(0), ProposalVoteOptionId(1)];
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "vote_on_proposal",
            manifest_args!(voter_account, 0u64, votes),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&voter_pk)],
    );
    receipt.expect_commit_success();
}

#[test]
fn test_multi_choice_exceeds_max_selections() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let package_address = ledger.compile_and_publish(this_package!());
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();

    // Create author account
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    // Create voter account
    let (voter_pk, _voter_sk, voter_account) = ledger.new_allocated_account();

    // Instantiate governance
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let governance_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Create multi-choice temperature check (max 2 selections)
    let draft = create_multi_choice_temp_check_draft();
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "make_temperature_check",
            manifest_args!(author_account, draft, Option::<String>::None),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&author_pk)],
        )
        .expect_commit_success();

    // Elevate to proposal after the temperature check closes.
    advance_by_days(&mut ledger, 30);
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(governance_component, "make_proposal", manifest_args!(0u64))
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
        )
        .expect_commit_success();

    // Try to vote with 3 selections (should fail - max is 2)
    let votes: Vec<ProposalVoteOptionId> = vec![
        ProposalVoteOptionId(0),
        ProposalVoteOptionId(1),
        ProposalVoteOptionId(2),
    ];
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "vote_on_proposal",
            manifest_args!(voter_account, 0u64, votes),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&voter_pk)],
    );
    receipt.expect_commit_failure();
}

#[test]
fn test_single_choice_requires_exactly_one_vote() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let package_address = ledger.compile_and_publish(this_package!());
    let (owner_badge, owner_account, owner_pk) = create_owner_badge_with_account(&mut ledger);
    let params = create_governance_parameters();

    // Create author account
    let (author_pk, _author_sk, author_account) = ledger.new_allocated_account();

    // Create voter account
    let (voter_pk, _voter_sk, voter_account) = ledger.new_allocated_account();

    // Instantiate governance
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "Governance",
            "instantiate",
            manifest_args!(owner_badge, params),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let governance_component = receipt.expect_commit(true).new_component_addresses()[0];

    // Create single-choice temperature check (max_selections = None)
    let draft = create_temp_check_draft();
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "make_temperature_check",
            manifest_args!(author_account, draft, Option::<String>::None),
        )
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&author_pk)],
        )
        .expect_commit_success();

    // Elevate to proposal after the temperature check closes.
    advance_by_days(&mut ledger, 30);
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .create_proof_from_account_of_amount(owner_account, owner_badge, dec!(1))
        .call_method(governance_component, "make_proposal", manifest_args!(0u64))
        .build();

    ledger
        .execute_manifest(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&owner_pk)],
        )
        .expect_commit_success();

    // Try to vote with 2 selections (should fail - single choice)
    let votes: Vec<ProposalVoteOptionId> = vec![ProposalVoteOptionId(0), ProposalVoteOptionId(1)];
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            governance_component,
            "vote_on_proposal",
            manifest_args!(voter_account, 0u64, votes),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&voter_pk)],
    );
    receipt.expect_commit_failure();
}

// =============================================================================
// Delegation Constraint Tests
// =============================================================================

#[test]
fn test_delegation_minimum_fraction() {
    let mut ledger = LedgerSimulatorBuilder::new().build();
    let (owner_badge, _owner_account, _owner_pk) = create_owner_badge_with_account(&mut ledger);
    let package_address = ledger.compile_and_publish(this_package!());

    // Create delegator and delegatee accounts
    let (delegator_pk, _delegator_sk, delegator_account) = ledger.new_allocated_account();
    let (_delegatee_pk, _delegatee_sk, delegatee_account) = ledger.new_allocated_account();

    // Instantiate vote delegation
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_function(
            package_address,
            "VoteDelegation",
            "instantiate",
            manifest_args!(owner_badge),
        )
        .build();

    let receipt = ledger.execute_manifest(manifest, vec![]);
    let delegation_component = receipt.expect_commit(true).new_component_addresses()[0];

    let valid_until = Instant::new(i64::MAX / 2);

    // Try to delegate less than minimum (0.005 < 0.01)
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "make_delegation",
            manifest_args!(
                delegator_account,
                delegatee_account,
                dec!("0.005"),
                valid_until
            ),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
    );
    receipt.expect_commit_failure();

    // Delegation at exactly minimum should succeed (0.01)
    let manifest = ManifestBuilder::new()
        .lock_fee_from_faucet()
        .call_method(
            delegation_component,
            "make_delegation",
            manifest_args!(
                delegator_account,
                delegatee_account,
                dec!("0.01"),
                valid_until
            ),
        )
        .build();

    let receipt = ledger.execute_manifest(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&delegator_pk)],
    );
    receipt.expect_commit_success();
}
