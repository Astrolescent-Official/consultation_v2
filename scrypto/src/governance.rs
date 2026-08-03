use crate::*;

const STOKENET_PACKAGE_ADDRESS_PREFIX: &str = "package_tdx_2_";

fn uses_minute_governance_durations(encoded_package_address: &str) -> bool {
    encoded_package_address.starts_with(STOKENET_PACKAGE_ADDRESS_PREFIX)
}

fn add_governance_duration(
    instant: Instant,
    duration: u32,
    encoded_package_address: &str,
) -> Option<Instant> {
    if uses_minute_governance_durations(encoded_package_address) {
        instant.add_minutes(i64::from(duration))
    } else {
        instant.add_days(i64::from(duration))
    }
}

#[blueprint]
#[events(
    TemperatureCheckCreatedEvent,
    TemperatureCheckOutcomeRecordedEvent,
    TemperatureCheckVotedEvent,
    ProposalCreatedEvent,
    ProposalVotedEvent,
    GovernanceParameterSetAddedEvent,
    GovernanceParameterSetUpdatedEvent,
    GovernanceParameterSetRetiredEvent,
    MajorityJudgmentElectionCreatedEvent,
    MajorityJudgmentElectionVotedEvent,
    MajorityJudgmentRoundStartedEvent,
    MajorityJudgmentTieResolutionRecordedEvent,
    MajorityJudgmentElectionHiddenToggledEvent
)]
mod governance {
    use super::*;

    enable_method_auth! {
        roles {
            owner => updatable_by: [];
        },
        methods {
            make_temperature_check => PUBLIC;
            vote_on_temperature_check => PUBLIC;
            vote_on_proposal => PUBLIC;
            vote_on_majority_judgment_election => PUBLIC;
            get_temperature_check_count => PUBLIC;
            get_proposal_count => PUBLIC;
            get_majority_judgment_election_count => PUBLIC;

            make_proposal => restrict_to: [owner];
            make_majority_judgment_election => restrict_to: [owner];
            record_temperature_check_outcome => restrict_to: [owner];
            start_majority_judgment_round_one => restrict_to: [owner];
            start_majority_judgment_rerun => restrict_to: [owner];
            record_majority_judgment_tie_resolution => restrict_to: [owner];
            add_governance_parameter_set => restrict_to: [owner];
            update_governance_parameter_set => restrict_to: [owner];
            retire_governance_parameter_set => restrict_to: [owner];
            toggle_temperature_check_hidden => restrict_to: [owner];
            toggle_proposal_hidden => restrict_to: [owner];
            toggle_majority_judgment_election_hidden => restrict_to: [owner];
        }
    }

    struct Governance {
        pub parameter_sets: KeyValueStore<String, GovernanceParameterSet>,
        pub temperature_checks: KeyValueStore<u64, TemperatureCheck>,
        pub temperature_check_count: u64,
        pub proposals: KeyValueStore<u64, Proposal>,
        pub proposal_count: u64,
        pub majority_judgment_elections: KeyValueStore<u64, MajorityJudgmentElection>,
        pub majority_judgment_election_count: u64,
    }

    impl Governance {
        pub fn instantiate(
            owner_badge: ResourceAddress,
            default_parameter_set: GovernanceParameterSetInput,
        ) -> Global<Governance> {
            Self::validate_parameter_set_input(&default_parameter_set);
            assert!(
                matches!(
                    &default_parameter_set.parameters,
                    GovernanceProcessParameters::Standard { .. }
                ),
                "The default governance parameter set must remain Standard"
            );

            let parameter_sets = KeyValueStore::new();
            parameter_sets.insert(
                DEFAULT_PARAMETER_SET_ID.to_string(),
                GovernanceParameterSet {
                    label: default_parameter_set.label,
                    version: 1,
                    retired: false,
                    parameters: default_parameter_set.parameters,
                },
            );

            Self {
                parameter_sets,
                temperature_checks: KeyValueStore::new(),
                temperature_check_count: 0,
                proposals: KeyValueStore::new(),
                proposal_count: 0,
                majority_judgment_elections: KeyValueStore::new(),
                majority_judgment_election_count: 0,
            }
            .instantiate()
            .prepare_to_globalize(OwnerRole::Fixed(rule!(require(owner_badge))))
            .roles(roles! {
                owner => rule!(require(owner_badge));
            })
            .enable_component_royalties(component_royalties! {
                init {
                    make_temperature_check => Free, updatable;
                    vote_on_temperature_check => Free, updatable;
                    vote_on_proposal => Free, updatable;
                    vote_on_majority_judgment_election => Free, updatable;
                    get_temperature_check_count => Free, updatable;
                    get_proposal_count => Free, updatable;
                    get_majority_judgment_election_count => Free, updatable;
                    make_proposal => Free, updatable;
                    make_majority_judgment_election => Free, updatable;
                    record_temperature_check_outcome => Free, updatable;
                    start_majority_judgment_round_one => Free, updatable;
                    start_majority_judgment_rerun => Free, updatable;
                    record_majority_judgment_tie_resolution => Free, updatable;
                    add_governance_parameter_set => Free, updatable;
                    update_governance_parameter_set => Free, updatable;
                    retire_governance_parameter_set => Free, updatable;
                    toggle_temperature_check_hidden => Free, updatable;
                    toggle_proposal_hidden => Free, updatable;
                    toggle_majority_judgment_election_hidden => Free, updatable;
                }
            })
            .globalize()
        }

        fn validate_parameter_set_id(parameter_set_id: &str) {
            let bytes = parameter_set_id.as_bytes();
            assert!(
                !bytes.is_empty() && bytes.len() <= MAX_PARAMETER_SET_ID_BYTES,
                "Parameter set identifier must be 1-{} ASCII bytes",
                MAX_PARAMETER_SET_ID_BYTES
            );
            assert!(
                bytes[0] != b'-' && bytes[bytes.len() - 1] != b'-',
                "Parameter set identifier cannot start or end with a hyphen"
            );

            let mut previous_was_hyphen = false;
            for byte in bytes {
                let is_hyphen = *byte == b'-';
                assert!(
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || is_hyphen,
                    "Parameter set identifier can contain only lowercase ASCII letters, digits, and hyphens"
                );
                assert!(
                    !(is_hyphen && previous_was_hyphen),
                    "Parameter set identifier cannot contain consecutive hyphens"
                );
                previous_was_hyphen = is_hyphen;
            }
        }

        fn validate_parameter_set_input(input: &GovernanceParameterSetInput) {
            assert!(
                !input.label.is_empty() && input.label.len() <= MAX_PARAMETER_SET_LABEL_BYTES,
                "Parameter set label must be 1-{} UTF-8 bytes",
                MAX_PARAMETER_SET_LABEL_BYTES
            );
            assert!(
                !input.label.trim().is_empty(),
                "Parameter set label cannot be blank"
            );
            assert!(
                input.label.trim() == input.label,
                "Parameter set label cannot have leading or trailing whitespace"
            );
            Self::validate_governance_parameters(&input.parameters);
        }

        fn validate_temperature_check_parameters(parameters: &TemperatureCheckParameters) {
            assert!(
                parameters.voting_days > 0,
                "Temperature check duration must be greater than zero"
            );
            assert!(
                parameters.quorum > Decimal::ZERO,
                "Temperature check quorum must be greater than zero"
            );
            assert!(
                parameters.approval_threshold > Decimal::ZERO
                    && parameters.approval_threshold <= Decimal::ONE,
                "Temperature check approval threshold must be greater than zero and at most one"
            );
        }

        fn validate_governance_parameters(parameters: &GovernanceProcessParameters) {
            Self::validate_temperature_check_parameters(parameters.temperature_check());
            match parameters {
                GovernanceProcessParameters::Standard { proposal, .. } => {
                    assert!(
                        proposal.voting_days > 0,
                        "Proposal duration must be greater than zero"
                    );
                    assert!(
                        proposal.quorum > Decimal::ZERO,
                        "Proposal quorum must be greater than zero"
                    );
                    assert!(
                        proposal.approval_threshold > Decimal::ZERO
                            && proposal.approval_threshold <= Decimal::ONE,
                        "Proposal approval threshold must be greater than zero and at most one"
                    );
                }
                GovernanceProcessParameters::MajorityJudgment { election, .. } => {
                    assert!(
                        election.voting_days > 0,
                        "Election voting duration must be greater than zero"
                    );
                    assert!(
                        election.rerun_voting_days > 0,
                        "Election rerun duration must be greater than zero"
                    );
                    assert!(
                        election.reserve_list_days > 0,
                        "Reserve-list duration must be greater than zero"
                    );
                    assert!(
                        election.quorum > Decimal::ZERO,
                        "Election quorum must be greater than zero"
                    );
                    assert!(
                        election.rerun_quorum > Decimal::ZERO,
                        "Rerun quorum must be greater than zero"
                    );
                    assert!(
                        election.rerun_quorum == election.quorum,
                        "Rerun quorum must match the Round 1 quorum"
                    );
                    assert!(
                        election.rerun_minimum_median_grade == election.minimum_median_grade,
                        "Rerun minimum median grade must match the Round 1 grade floor"
                    );
                }
            }
        }

        fn resolve_parameter_set(
            &self,
            parameter_set_id: Option<String>,
        ) -> GovernanceParameterSetSnapshot {
            let id = parameter_set_id.unwrap_or_else(|| DEFAULT_PARAMETER_SET_ID.to_string());
            let record = self
                .parameter_sets
                .get(&id)
                .expect("Governance parameter set not found");
            assert!(!record.retired, "Governance parameter set has been retired");

            GovernanceParameterSetSnapshot {
                id,
                label: record.label.clone(),
                version: record.version,
                parameters: record.parameters.clone(),
            }
        }

        fn checked_add_governance_duration(instant: Instant, duration: u32, name: &str) -> Instant {
            let encoded_package_address =
                Runtime::bech32_encode_address(Runtime::package_address());
            add_governance_duration(instant, duration, &encoded_package_address)
                .unwrap_or_else(|| panic!("{} timestamp overflow", name))
        }

        fn validate_standard_follow_up(
            vote_options: Vec<ProposalVoteOptionInput>,
            max_selections: Option<u32>,
        ) -> TemperatureCheckFollowUp {
            assert!(
                !vote_options.is_empty(),
                "Temperature check must have at least one vote option"
            );
            assert!(
                vote_options.len() <= MAX_VOTE_OPTIONS,
                "Too many vote options (max {})",
                MAX_VOTE_OPTIONS
            );
            for option in &vote_options {
                assert!(
                    !option.label.trim().is_empty(),
                    "Vote option labels cannot be blank"
                );
            }

            if let Some(maximum) = max_selections {
                assert!(maximum > 0, "max_selections must be greater than zero");
                assert!(
                    maximum <= MAX_SELECTIONS,
                    "max_selections cannot exceed {}",
                    MAX_SELECTIONS
                );
                assert!(
                    usize::try_from(maximum).unwrap() <= vote_options.len(),
                    "max_selections cannot exceed number of vote options"
                );
            }

            TemperatureCheckFollowUp::StandardProposal {
                vote_options: vote_options
                    .into_iter()
                    .enumerate()
                    .map(|(index, input)| ProposalVoteOption {
                        id: ProposalVoteOptionId(u32::try_from(index).unwrap()),
                        label: input.label,
                    })
                    .collect(),
                max_selections,
            }
        }

        fn validate_majority_judgment_follow_up(
            role_id: String,
            seat_count: u32,
            candidates: Vec<MajorityJudgmentCandidateInput>,
        ) -> TemperatureCheckFollowUp {
            assert!(
                !role_id.trim().is_empty(),
                "Role identifier cannot be blank"
            );
            assert!(
                candidates.len() >= MIN_MAJORITY_JUDGMENT_CANDIDATES
                    && candidates.len() <= MAX_MAJORITY_JUDGMENT_CANDIDATES,
                "Election must contain 1-20 candidates"
            );
            assert!(seat_count >= 1, "Election must contain at least one seat");

            let mut references: Vec<String> = Vec::new();
            for candidate in &candidates {
                assert!(
                    !candidate.reference.trim().is_empty(),
                    "Candidate reference cannot be blank"
                );
                assert!(
                    !candidate.display_name.trim().is_empty(),
                    "Candidate display name cannot be blank"
                );
                assert!(
                    candidate.links.len() <= MAX_CANDIDATE_LINKS,
                    "Too many candidate links (max {})",
                    MAX_CANDIDATE_LINKS
                );
                assert!(
                    candidate
                        .links
                        .iter()
                        .all(|link| Self::is_valid_http_url(link.as_str())),
                    "Candidate links must be valid HTTP(S) URLs within the ledger URL length limit"
                );
                assert!(
                    !references.contains(&candidate.reference),
                    "Candidate references must be unique"
                );
                references.push(candidate.reference.clone());
            }

            TemperatureCheckFollowUp::MajorityJudgmentElection {
                role_id,
                seat_count,
                candidates: candidates
                    .into_iter()
                    .enumerate()
                    .map(|(index, input)| MajorityJudgmentCandidate {
                        id: MajorityJudgmentCandidateId(u32::try_from(index).unwrap()),
                        reference: input.reference,
                        display_name: input.display_name,
                        description: input.description,
                        links: input.links,
                        display_order: u32::try_from(index).unwrap(),
                    })
                    .collect(),
            }
        }

        fn is_valid_http_url(value: &str) -> bool {
            if value.is_empty()
                || value.len() > MAX_URL_LENGTH
                || !value
                    .as_bytes()
                    .iter()
                    .all(|byte| byte.is_ascii_graphic() && *byte != b'\\')
            {
                return false;
            }

            let authority_and_suffix = if let Some(rest) = value.strip_prefix("https://") {
                rest
            } else if let Some(rest) = value.strip_prefix("http://") {
                rest
            } else {
                return false;
            };
            let authority_end = authority_and_suffix
                .find(['/', '?', '#'])
                .unwrap_or(authority_and_suffix.len());
            let authority = &authority_and_suffix[..authority_end];
            if authority.is_empty() || authority.contains('@') {
                return false;
            }

            let (host, port) = match authority.rsplit_once(':') {
                Some((host, port)) => (host, Some(port)),
                None => (authority, None),
            };
            if host.contains(':')
                || host.split('.').any(|label| {
                    label.is_empty()
                        || label.starts_with('-')
                        || label.ends_with('-')
                        || !label
                            .as_bytes()
                            .iter()
                            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
                })
            {
                return false;
            }

            match port {
                Some(port) => {
                    !port.is_empty()
                        && port.as_bytes().iter().all(u8::is_ascii_digit)
                        && port.parse::<u16>().is_ok_and(|port| port > 0)
                }
                None => true,
            }
        }

        fn validate_and_normalize_ballot(
            candidates: &[MajorityJudgmentCandidate],
            mut grades: Vec<CandidateGrade>,
        ) -> Vec<CandidateGrade> {
            assert!(
                grades.len() == candidates.len(),
                "A ballot must grade every candidate exactly once"
            );
            grades.sort_by_key(|candidate_grade| candidate_grade.candidate_id);
            for (candidate, candidate_grade) in candidates.iter().zip(grades.iter()) {
                assert!(
                    candidate.id == candidate_grade.candidate_id,
                    "A ballot contains a duplicate or unknown candidate"
                );
            }
            grades
        }

        fn new_round(
            snapshot: Instant,
            start: Instant,
            deadline: Instant,
            quorum: Decimal,
            minimum_median_grade: Grade,
        ) -> MajorityJudgmentRound {
            MajorityJudgmentRound {
                snapshot,
                start,
                deadline,
                quorum,
                minimum_median_grade,
                voters: KeyValueStore::new(),
                votes: KeyValueStore::new(),
                vote_count: 0,
                revote_count: 0,
            }
        }

        fn majority_judgment_round_context(
            &self,
            election_id: u64,
        ) -> (Instant, MajorityJudgmentParameters) {
            let (_, temperature_check) = self.passed_temperature_check_for_election(election_id);
            let parameters = match &temperature_check.parameter_set.parameters {
                GovernanceProcessParameters::MajorityJudgment { election, .. } => election.clone(),
                GovernanceProcessParameters::Standard { .. } => {
                    panic!("Election does not contain Majority Judgment parameters")
                }
            };
            (temperature_check.deadline, parameters)
        }

        fn open_majority_judgment_round(
            election: &mut MajorityJudgmentElection,
            election_id: u64,
            round_id: MajorityJudgmentRoundId,
            snapshot: Instant,
            start: Instant,
            deadline: Instant,
            quorum: Decimal,
            minimum_median_grade: Grade,
        ) {
            match round_id {
                MajorityJudgmentRoundId::RoundOne => {
                    assert!(election.round_one.is_none(), "Round 1 has already opened");
                }
                MajorityJudgmentRoundId::Rerun => {
                    assert!(election.rerun.is_none(), "Election rerun already exists");
                }
            }
            let round = Self::new_round(snapshot, start, deadline, quorum, minimum_median_grade);
            match round_id {
                MajorityJudgmentRoundId::RoundOne => election.round_one = Some(round),
                MajorityJudgmentRoundId::Rerun => election.rerun = Some(round),
            }
            Runtime::emit_event(MajorityJudgmentRoundStartedEvent {
                election_id,
                round: round_id,
                snapshot,
                start,
                deadline,
                quorum,
                minimum_median_grade,
            });
        }

        fn validate_temperature_check_draft(draft: &TemperatureCheckDraft) {
            assert!(
                !draft.title.trim().is_empty(),
                "Temperature check title cannot be empty"
            );
            assert!(
                !draft.short_description.trim().is_empty(),
                "Temperature check short description cannot be empty"
            );
            assert!(
                !draft.description.trim().is_empty(),
                "Temperature check description cannot be empty"
            );
            assert!(
                draft.links.len() <= MAX_LINKS,
                "Too many links (max {})",
                MAX_LINKS
            );
        }

        fn apply_candidate_order(
            candidates: &mut [MajorityJudgmentCandidate],
            candidate_order: Vec<MajorityJudgmentCandidateId>,
        ) {
            assert!(
                candidate_order.len() == candidates.len(),
                "Candidate order must contain every candidate exactly once"
            );
            let mut sorted_order = candidate_order.clone();
            sorted_order.sort();
            for (index, candidate_id) in sorted_order.iter().enumerate() {
                assert!(
                    candidate_id.0 == u32::try_from(index).unwrap(),
                    "Candidate order must contain every candidate exactly once"
                );
            }
            for (display_order, candidate_id) in candidate_order.iter().enumerate() {
                let candidate = candidates
                    .iter_mut()
                    .find(|candidate| candidate.id == *candidate_id)
                    .expect("Candidate order contains an unknown candidate");
                candidate.display_order = u32::try_from(display_order).unwrap();
            }
        }

        fn insert_temperature_check(
            &mut self,
            author: Global<Account>,
            draft: TemperatureCheckDraft,
            follow_up: TemperatureCheckFollowUp,
            parameter_set: GovernanceParameterSetSnapshot,
            snapshot: Instant,
            start: Instant,
            deadline: Instant,
            continuation: Option<ConsultationContinuation>,
        ) -> u64 {
            let id = self.temperature_check_count;
            self.temperature_check_count = self
                .temperature_check_count
                .checked_add(1)
                .expect("Temperature check identifier exhausted");
            let parameter_set_id = parameter_set.id.clone();
            let parameter_set_version = parameter_set.version;
            let title = draft.title.clone();

            self.temperature_checks.insert(
                id,
                TemperatureCheck {
                    title: draft.title,
                    short_description: draft.short_description,
                    description: draft.description,
                    links: draft.links,
                    follow_up,
                    parameter_set,
                    voters: KeyValueStore::new(),
                    votes: KeyValueStore::new(),
                    vote_count: 0,
                    revote_count: 0,
                    snapshot,
                    start,
                    deadline,
                    outcome: None,
                    continuation,
                    author,
                    hidden: false,
                },
            );

            Runtime::emit_event(TemperatureCheckCreatedEvent {
                temperature_check_id: id,
                title,
                snapshot,
                start,
                deadline,
                parameter_set_id,
                parameter_set_version,
            });
            id
        }

        pub fn make_temperature_check(
            &mut self,
            author: Global<Account>,
            draft: TemperatureCheckDraft,
            parameter_set_id: Option<String>,
        ) -> u64 {
            Runtime::assert_access_rule(author.get_owner_role().rule);
            Self::validate_temperature_check_draft(&draft);

            let parameter_set = self.resolve_parameter_set(parameter_set_id);
            let follow_up = match (draft.follow_up.clone(), &parameter_set.parameters) {
                (
                    TemperatureCheckFollowUpDraft::StandardProposal {
                        vote_options,
                        max_selections,
                    },
                    GovernanceProcessParameters::Standard { .. },
                ) => Self::validate_standard_follow_up(vote_options, max_selections),
                (TemperatureCheckFollowUpDraft::MajorityJudgmentElection { .. }, _) => {
                    panic!(
                        "Majority Judgment temperature checks must be created atomically with their election"
                    )
                }
                _ => panic!("A Standard parameter set is required for a standard consultation"),
            };

            let now = Clock::current_time_rounded_to_seconds();
            let deadline = Self::checked_add_governance_duration(
                now,
                parameter_set.parameters.temperature_check().voting_days,
                "Temperature check deadline",
            );
            self.insert_temperature_check(
                author,
                draft,
                follow_up,
                parameter_set,
                now,
                now,
                deadline,
                None,
            )
        }

        pub fn record_temperature_check_outcome(
            &mut self,
            temperature_check_id: u64,
            passed: bool,
        ) {
            let now = Clock::current_time_rounded_to_seconds();
            let mut temperature_check = self
                .temperature_checks
                .get_mut(&temperature_check_id)
                .expect("Temperature check not found");
            assert!(
                now.compare(temperature_check.deadline, TimeComparisonOperator::Gte),
                "Temperature check has not ended"
            );
            assert!(
                temperature_check.outcome.is_none(),
                "Temperature check outcome has already been recorded"
            );
            temperature_check.outcome = Some(if passed {
                TemperatureCheckOutcome::Passed { recorded_at: now }
            } else {
                TemperatureCheckOutcome::Failed { recorded_at: now }
            });
            Runtime::emit_event(TemperatureCheckOutcomeRecordedEvent {
                temperature_check_id,
                passed,
                recorded_at: now,
            });
        }

        pub fn make_proposal(&mut self, temperature_check_id: u64) -> u64 {
            let now = Clock::current_time_rounded_to_seconds();
            let mut temperature_check = self
                .temperature_checks
                .get_mut(&temperature_check_id)
                .expect("Temperature check not found");
            assert!(
                now.compare(temperature_check.deadline, TimeComparisonOperator::Gte),
                "Temperature check has not ended"
            );
            assert!(
                temperature_check
                    .outcome
                    .is_some_and(TemperatureCheckOutcome::passed),
                "Temperature check has not passed"
            );
            assert!(
                temperature_check.continuation.is_none(),
                "Temperature check already has a continuation"
            );

            let (vote_options, max_selections) = match &temperature_check.follow_up {
                TemperatureCheckFollowUp::StandardProposal {
                    vote_options,
                    max_selections,
                } => (vote_options.clone(), *max_selections),
                TemperatureCheckFollowUp::MajorityJudgmentElection { .. } => {
                    panic!("Majority Judgment temperature checks cannot create standard proposals")
                }
            };
            let proposal_parameters = match &temperature_check.parameter_set.parameters {
                GovernanceProcessParameters::Standard { proposal, .. } => proposal.clone(),
                GovernanceProcessParameters::MajorityJudgment { .. } => {
                    panic!("Majority Judgment parameter sets cannot create standard proposals")
                }
            };

            let proposal_id = self.proposal_count;
            self.proposal_count = self
                .proposal_count
                .checked_add(1)
                .expect("Proposal identifier exhausted");
            let deadline = Self::checked_add_governance_duration(
                now,
                proposal_parameters.voting_days,
                "Proposal deadline",
            );
            let proposal = Proposal {
                title: temperature_check.title.clone(),
                short_description: temperature_check.short_description.clone(),
                description: temperature_check.description.clone(),
                vote_options,
                links: temperature_check.links.clone(),
                parameter_set: temperature_check.parameter_set.clone(),
                max_selections,
                voters: KeyValueStore::new(),
                votes: KeyValueStore::new(),
                vote_count: 0,
                revote_count: 0,
                start: now,
                deadline,
                temperature_check_id,
                author: temperature_check.author,
                hidden: false,
            };
            temperature_check.continuation = Some(ConsultationContinuation::Proposal(proposal_id));
            drop(temperature_check);

            let title = proposal.title.clone();
            let parameter_set_id = proposal.parameter_set.id.clone();
            let parameter_set_version = proposal.parameter_set.version;
            self.proposals.insert(proposal_id, proposal);
            Runtime::emit_event(ProposalCreatedEvent {
                proposal_id,
                temperature_check_id,
                title,
                start: now,
                deadline,
                parameter_set_id,
                parameter_set_version,
            });
            proposal_id
        }

        pub fn make_majority_judgment_election(
            &mut self,
            author: Global<Account>,
            draft: TemperatureCheckDraft,
            parameter_set_id: String,
            candidate_order: Vec<MajorityJudgmentCandidateId>,
        ) -> u64 {
            Runtime::assert_access_rule(author.get_owner_role().rule);
            Self::validate_temperature_check_draft(&draft);
            let now = Clock::current_time_rounded_to_seconds();
            let parameter_set = self.resolve_parameter_set(Some(parameter_set_id));
            match &parameter_set.parameters {
                GovernanceProcessParameters::MajorityJudgment { .. } => (),
                GovernanceProcessParameters::Standard { .. } => {
                    panic!("A Majority Judgment parameter set is required for an election")
                }
            };
            let temperature_check_deadline = Self::checked_add_governance_duration(
                now,
                parameter_set.parameters.temperature_check().voting_days,
                "Temperature check deadline",
            );

            let (role_id, seat_count, mut candidates) = match draft.follow_up.clone() {
                TemperatureCheckFollowUpDraft::MajorityJudgmentElection {
                    role_id,
                    seat_count,
                    candidates,
                } => match Self::validate_majority_judgment_follow_up(
                    role_id, seat_count, candidates,
                ) {
                    TemperatureCheckFollowUp::MajorityJudgmentElection {
                        role_id,
                        seat_count,
                        candidates,
                    } => (role_id, seat_count, candidates),
                    TemperatureCheckFollowUp::StandardProposal { .. } => unreachable!(),
                },
                TemperatureCheckFollowUpDraft::StandardProposal { .. } => {
                    panic!("A Majority Judgment election draft is required")
                }
            };
            Self::apply_candidate_order(&mut candidates, candidate_order);

            let election_id = self.majority_judgment_election_count;
            self.majority_judgment_election_count = self
                .majority_judgment_election_count
                .checked_add(1)
                .expect("Majority Judgment election identifier exhausted");
            let snapshot = now;
            let follow_up = TemperatureCheckFollowUp::MajorityJudgmentElection {
                role_id: role_id.clone(),
                seat_count,
                candidates,
            };
            let temperature_check_id = self.insert_temperature_check(
                author,
                draft,
                follow_up,
                parameter_set.clone(),
                snapshot,
                now,
                temperature_check_deadline,
                Some(ConsultationContinuation::MajorityJudgmentElection(
                    election_id,
                )),
            );
            let election = MajorityJudgmentElection {
                temperature_check_id,
                round_one: None,
                rerun: None,
                tie_resolution: None,
                hidden: false,
            };
            self.majority_judgment_elections
                .insert(election_id, election);
            Runtime::emit_event(MajorityJudgmentElectionCreatedEvent {
                election_id,
                temperature_check_id,
                role_id,
                seat_count,
                snapshot,
                parameter_set_id: parameter_set.id,
                parameter_set_version: parameter_set.version,
            });
            election_id
        }

        pub fn vote_on_temperature_check(
            &mut self,
            account: Global<Account>,
            temperature_check_id: u64,
            vote: TemperatureCheckVote,
        ) {
            Runtime::assert_access_rule(account.get_owner_role().rule);
            let mut temperature_check = self
                .temperature_checks
                .get_mut(&temperature_check_id)
                .expect("Temperature check not found");
            let now = Clock::current_time_rounded_to_seconds();
            assert!(
                now.compare(temperature_check.start, TimeComparisonOperator::Gte),
                "Voting has not started yet"
            );
            assert!(
                now.compare(temperature_check.deadline, TimeComparisonOperator::Lt),
                "Voting has ended"
            );

            let replacing_vote_id = temperature_check
                .voters
                .get(&account)
                .map(|entry| entry.vote_id);
            if replacing_vote_id.is_some() {
                temperature_check.revote_count = temperature_check
                    .revote_count
                    .checked_add(1)
                    .expect("Temperature-check revote count exhausted");
            }
            let vote_id = temperature_check.vote_count;
            temperature_check.vote_count = temperature_check
                .vote_count
                .checked_add(1)
                .expect("Temperature-check vote identifier exhausted");
            temperature_check
                .voters
                .insert(account, TemperatureCheckVoterEntry { vote_id, vote });
            temperature_check.votes.insert(
                vote_id,
                TemperatureCheckVoteRecord {
                    voter: account,
                    vote,
                    replacing_vote_id,
                },
            );
            Runtime::emit_event(TemperatureCheckVotedEvent {
                temperature_check_id,
                vote_id,
                account,
                vote,
                replacing_vote_id,
            });
        }

        pub fn vote_on_proposal(
            &mut self,
            account: Global<Account>,
            proposal_id: u64,
            options: Vec<ProposalVoteOptionId>,
        ) {
            Runtime::assert_access_rule(account.get_owner_role().rule);
            let mut proposal = self
                .proposals
                .get_mut(&proposal_id)
                .expect("Proposal not found");
            let now = Clock::current_time_rounded_to_seconds();
            assert!(
                now.compare(proposal.start, TimeComparisonOperator::Gte),
                "Voting has not started yet"
            );
            assert!(
                now.compare(proposal.deadline, TimeComparisonOperator::Lt),
                "Voting has ended"
            );
            assert!(!options.is_empty(), "Must select at least one option");
            match proposal.max_selections {
                None => assert!(
                    options.len() == 1,
                    "This is a single-choice proposal, select exactly one option"
                ),
                Some(maximum) => assert!(
                    options.len() <= usize::try_from(maximum).unwrap(),
                    "Too many options selected"
                ),
            }
            let selection_count = options.len();
            let mut normalized = options;
            normalized.sort();
            normalized.dedup();
            assert!(
                normalized.len() == selection_count,
                "Duplicate vote option selected"
            );
            for option in &normalized {
                assert!(
                    proposal
                        .vote_options
                        .iter()
                        .any(|candidate| candidate.id == *option),
                    "Invalid vote option"
                );
            }

            let replacing_vote_id = proposal.voters.get(&account).map(|entry| entry.vote_id);
            if replacing_vote_id.is_some() {
                proposal.revote_count = proposal
                    .revote_count
                    .checked_add(1)
                    .expect("Proposal revote count exhausted");
            }
            let vote_id = proposal.vote_count;
            proposal.vote_count = proposal
                .vote_count
                .checked_add(1)
                .expect("Proposal vote identifier exhausted");
            proposal.voters.insert(
                account,
                ProposalVoterEntry {
                    vote_id,
                    options: normalized.clone(),
                },
            );
            proposal.votes.insert(
                vote_id,
                ProposalVoteRecord {
                    voter: account,
                    options: normalized.clone(),
                    replacing_vote_id,
                },
            );
            Runtime::emit_event(ProposalVotedEvent {
                proposal_id,
                vote_id,
                account,
                options: normalized,
                replacing_vote_id,
            });
        }

        fn passed_temperature_check_for_election(
            &self,
            election_id: u64,
        ) -> (u64, KeyValueEntryRef<'_, TemperatureCheck>) {
            let temperature_check_id = self
                .majority_judgment_elections
                .get(&election_id)
                .expect("Majority Judgment election not found")
                .temperature_check_id;
            let temperature_check = self
                .temperature_checks
                .get(&temperature_check_id)
                .expect("Election temperature check not found");
            assert!(
                temperature_check
                    .outcome
                    .is_some_and(TemperatureCheckOutcome::passed),
                "Election temperature check has not passed"
            );
            (temperature_check_id, temperature_check)
        }

        fn majority_judgment_candidates(&self, election_id: u64) -> Vec<MajorityJudgmentCandidate> {
            let temperature_check_id = self
                .majority_judgment_elections
                .get(&election_id)
                .expect("Majority Judgment election not found")
                .temperature_check_id;
            let temperature_check = self
                .temperature_checks
                .get(&temperature_check_id)
                .expect("Election temperature check not found");
            match &temperature_check.follow_up {
                TemperatureCheckFollowUp::MajorityJudgmentElection { candidates, .. } => {
                    candidates.clone()
                }
                TemperatureCheckFollowUp::StandardProposal { .. } => {
                    panic!("Election is linked to a Standard temperature check")
                }
            }
        }

        pub fn vote_on_majority_judgment_election(
            &mut self,
            account: Global<Account>,
            election_id: u64,
            round_id: MajorityJudgmentRoundId,
            grades: Vec<CandidateGrade>,
        ) {
            Runtime::assert_access_rule(account.get_owner_role().rule);
            let candidates = self.majority_judgment_candidates(election_id);
            let mut election = self
                .majority_judgment_elections
                .get_mut(&election_id)
                .expect("Majority Judgment election not found");
            let normalized = Self::validate_and_normalize_ballot(&candidates, grades);
            let round = match round_id {
                MajorityJudgmentRoundId::RoundOne => {
                    election.round_one.as_mut().expect("Round 1 has not opened")
                }
                MajorityJudgmentRoundId::Rerun => election
                    .rerun
                    .as_mut()
                    .expect("Majority Judgment rerun has not been started"),
            };
            let now = Clock::current_time_rounded_to_seconds();
            assert!(
                now.compare(round.start, TimeComparisonOperator::Gte),
                "Voting has not started yet"
            );
            assert!(
                now.compare(round.deadline, TimeComparisonOperator::Lt),
                "Voting has ended"
            );

            let replacing_vote_id = round.voters.get(&account).map(|entry| entry.vote_id);
            if replacing_vote_id.is_some() {
                round.revote_count = round
                    .revote_count
                    .checked_add(1)
                    .expect("Majority Judgment revote count exhausted");
            }
            let vote_id = round.vote_count;
            round.vote_count = round
                .vote_count
                .checked_add(1)
                .expect("Majority Judgment vote identifier exhausted");
            round.voters.insert(
                account,
                MajorityJudgmentVoterEntry {
                    vote_id,
                    grades: normalized.clone(),
                },
            );
            round.votes.insert(
                vote_id,
                MajorityJudgmentVoteRecord {
                    voter: account,
                    grades: normalized.clone(),
                    replacing_vote_id,
                },
            );
            Runtime::emit_event(MajorityJudgmentElectionVotedEvent {
                election_id,
                round: round_id,
                vote_id,
                account,
                grades: normalized,
                replacing_vote_id,
            });
        }

        pub fn start_majority_judgment_round_one(&mut self, election_id: u64) {
            let now = Clock::current_time_rounded_to_seconds();
            let (temperature_check_deadline, parameters) =
                self.majority_judgment_round_context(election_id);
            assert!(
                now.compare(temperature_check_deadline, TimeComparisonOperator::Gte),
                "Temperature check has not ended"
            );
            let mut election = self
                .majority_judgment_elections
                .get_mut(&election_id)
                .expect("Majority Judgment election not found");
            assert!(election.round_one.is_none(), "Round 1 has already opened");
            let deadline = Self::checked_add_governance_duration(
                now,
                parameters.voting_days,
                "Election voting deadline",
            );
            // Hidden is a moderation flag, while rerun/tie state is unreachable until
            // Round 1 exists; neither is an additional lifecycle gate here.
            Self::open_majority_judgment_round(
                &mut election,
                election_id,
                MajorityJudgmentRoundId::RoundOne,
                now,
                now,
                deadline,
                parameters.quorum,
                parameters.minimum_median_grade,
            );
        }

        pub fn start_majority_judgment_rerun(&mut self, election_id: u64) {
            let now = Clock::current_time_rounded_to_seconds();
            let (_, parameters) = self.majority_judgment_round_context(election_id);
            let mut election = self
                .majority_judgment_elections
                .get_mut(&election_id)
                .expect("Majority Judgment election not found");
            let round_one = election.round_one.as_ref().expect("Round 1 has not opened");
            assert!(
                now.compare(round_one.deadline, TimeComparisonOperator::Gte),
                "Round 1 has not ended"
            );
            assert!(election.rerun.is_none(), "Election rerun already exists");
            assert!(
                election.tie_resolution.is_none(),
                "An election with a recorded tie resolution cannot be rerun"
            );
            let snapshot = round_one.snapshot;
            let deadline = Self::checked_add_governance_duration(
                now,
                parameters.rerun_voting_days,
                "Rerun voting deadline",
            );
            Self::open_majority_judgment_round(
                &mut election,
                election_id,
                MajorityJudgmentRoundId::Rerun,
                snapshot,
                now,
                deadline,
                parameters.rerun_quorum,
                parameters.rerun_minimum_median_grade,
            );
        }

        pub fn record_majority_judgment_tie_resolution(
            &mut self,
            election_id: u64,
            round_id: MajorityJudgmentRoundId,
            ordered_candidate_ids: Vec<MajorityJudgmentCandidateId>,
        ) {
            let now = Clock::current_time_rounded_to_seconds();
            let candidates = self.majority_judgment_candidates(election_id);
            let mut election = self
                .majority_judgment_elections
                .get_mut(&election_id)
                .expect("Majority Judgment election not found");
            assert!(
                election.tie_resolution.is_none(),
                "Election tie resolution already exists"
            );
            let deadline = match round_id {
                MajorityJudgmentRoundId::RoundOne => {
                    election
                        .round_one
                        .as_ref()
                        .expect("Round 1 has not opened")
                        .deadline
                }
                MajorityJudgmentRoundId::Rerun => {
                    election
                        .rerun
                        .as_ref()
                        .expect("Majority Judgment rerun has not been started")
                        .deadline
                }
            };
            assert!(
                now.compare(deadline, TimeComparisonOperator::Gte),
                "The selected election round has not ended"
            );
            assert!(
                ordered_candidate_ids.len() >= 2,
                "A tie resolution must contain at least two candidates"
            );
            let mut unique_ids = ordered_candidate_ids.clone();
            unique_ids.sort();
            unique_ids.dedup();
            assert!(
                unique_ids.len() == ordered_candidate_ids.len(),
                "Tie resolution candidates must be unique"
            );
            for candidate_id in &ordered_candidate_ids {
                assert!(
                    candidates
                        .iter()
                        .any(|candidate| candidate.id == *candidate_id),
                    "Tie resolution contains an unknown candidate"
                );
            }
            election.tie_resolution = Some(MajorityJudgmentTieResolution {
                round: round_id,
                ordered_candidate_ids: ordered_candidate_ids.clone(),
                recorded_at: now,
            });
            Runtime::emit_event(MajorityJudgmentTieResolutionRecordedEvent {
                election_id,
                round: round_id,
                ordered_candidate_ids,
                recorded_at: now,
            });
        }

        pub fn get_temperature_check_count(&self) -> u64 {
            self.temperature_check_count
        }

        pub fn get_proposal_count(&self) -> u64 {
            self.proposal_count
        }

        pub fn get_majority_judgment_election_count(&self) -> u64 {
            self.majority_judgment_election_count
        }

        pub fn add_governance_parameter_set(
            &mut self,
            parameter_set_id: String,
            input: GovernanceParameterSetInput,
        ) {
            Self::validate_parameter_set_id(&parameter_set_id);
            Self::validate_parameter_set_input(&input);
            assert!(
                self.parameter_sets.get(&parameter_set_id).is_none(),
                "Governance parameter set identifier already exists"
            );
            let parameter_set = GovernanceParameterSet {
                label: input.label,
                version: 1,
                retired: false,
                parameters: input.parameters,
            };
            self.parameter_sets
                .insert(parameter_set_id.clone(), parameter_set.clone());
            Runtime::emit_event(GovernanceParameterSetAddedEvent {
                parameter_set_id,
                parameter_set,
            });
        }

        pub fn update_governance_parameter_set(
            &mut self,
            parameter_set_id: String,
            input: GovernanceParameterSetInput,
        ) {
            Self::validate_parameter_set_id(&parameter_set_id);
            Self::validate_parameter_set_input(&input);
            let mut parameter_set = self
                .parameter_sets
                .get_mut(&parameter_set_id)
                .expect("Governance parameter set not found");
            assert!(
                !parameter_set.retired,
                "Retired governance parameter sets cannot be updated"
            );
            assert!(
                parameter_set.parameters.same_variant(&input.parameters),
                "Governance parameter set variant cannot be changed"
            );
            if parameter_set_id == DEFAULT_PARAMETER_SET_ID {
                assert!(
                    matches!(
                        &input.parameters,
                        GovernanceProcessParameters::Standard { .. }
                    ),
                    "The default governance parameter set must remain Standard"
                );
            }

            let previous_version = parameter_set.version;
            parameter_set.version = previous_version
                .checked_add(1)
                .expect("Governance parameter set version exhausted");
            parameter_set.label = input.label;
            parameter_set.parameters = input.parameters;
            let updated_parameter_set = parameter_set.clone();
            drop(parameter_set);
            Runtime::emit_event(GovernanceParameterSetUpdatedEvent {
                parameter_set_id,
                previous_version,
                parameter_set: updated_parameter_set,
            });
        }

        pub fn retire_governance_parameter_set(&mut self, parameter_set_id: String) {
            Self::validate_parameter_set_id(&parameter_set_id);
            assert!(
                parameter_set_id != DEFAULT_PARAMETER_SET_ID,
                "The default governance parameter set cannot be retired"
            );
            let mut parameter_set = self
                .parameter_sets
                .get_mut(&parameter_set_id)
                .expect("Governance parameter set not found");
            assert!(
                !parameter_set.retired,
                "Governance parameter set is already retired"
            );
            parameter_set.retired = true;
            let version = parameter_set.version;
            drop(parameter_set);
            Runtime::emit_event(GovernanceParameterSetRetiredEvent {
                parameter_set_id,
                version,
            });
        }

        pub fn toggle_temperature_check_hidden(&mut self, temperature_check_id: u64) {
            let mut temperature_check = self
                .temperature_checks
                .get_mut(&temperature_check_id)
                .expect("Temperature check not found");
            temperature_check.hidden = !temperature_check.hidden;
        }

        pub fn toggle_proposal_hidden(&mut self, proposal_id: u64) {
            let mut proposal = self
                .proposals
                .get_mut(&proposal_id)
                .expect("Proposal not found");
            proposal.hidden = !proposal.hidden;
        }

        pub fn toggle_majority_judgment_election_hidden(&mut self, election_id: u64) {
            let mut election = self
                .majority_judgment_elections
                .get_mut(&election_id)
                .expect("Majority Judgment election not found");
            election.hidden = !election.hidden;
            let hidden = election.hidden;
            drop(election);
            Runtime::emit_event(MajorityJudgmentElectionHiddenToggledEvent {
                election_id,
                hidden,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{add_governance_duration, uses_minute_governance_durations};
    use scrypto::prelude::Instant;

    #[test]
    fn only_stokenet_package_addresses_use_minute_durations() {
        assert!(uses_minute_governance_durations("package_tdx_2_1test"));
        assert!(!uses_minute_governance_durations("package_rdx1test"));
        assert!(!uses_minute_governance_durations("package_sim1test"));
        assert!(!uses_minute_governance_durations("component_tdx_2_1test"));
    }

    #[test]
    fn stokenet_adds_minutes_and_other_networks_add_days() {
        let start = Instant::new(0);

        assert_eq!(
            add_governance_duration(start, 2, "package_tdx_2_1test"),
            Some(Instant::new(120))
        );
        assert_eq!(
            add_governance_duration(start, 2, "package_rdx1test"),
            Some(Instant::new(172_800))
        );
    }
}
