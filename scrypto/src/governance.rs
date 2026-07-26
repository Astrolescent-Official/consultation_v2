use crate::{
    GovernanceParameterSet, GovernanceParameterSetAddedEvent, GovernanceParameterSetInput,
    GovernanceParameterSetRetiredEvent, GovernanceParameterSetSnapshot,
    GovernanceParameterSetUpdatedEvent, GovernanceParameters, Proposal, ProposalCreatedEvent,
    ProposalVoteOption, ProposalVoteOptionId, ProposalVoteRecord, ProposalVotedEvent,
    ProposalVoterEntry, TemperatureCheck, TemperatureCheckCreatedEvent, TemperatureCheckDraft,
    TemperatureCheckVote, TemperatureCheckVoteRecord, TemperatureCheckVotedEvent,
    TemperatureCheckVoterEntry, DEFAULT_PARAMETER_SET_ID, MAX_LINKS, MAX_PARAMETER_SET_ID_BYTES,
    MAX_PARAMETER_SET_LABEL_BYTES, MAX_SELECTIONS, MAX_VOTE_OPTIONS,
};
use scrypto::prelude::*;

#[blueprint]
#[events(
    TemperatureCheckCreatedEvent,
    TemperatureCheckVotedEvent,
    ProposalCreatedEvent,
    ProposalVotedEvent,
    GovernanceParameterSetAddedEvent,
    GovernanceParameterSetUpdatedEvent,
    GovernanceParameterSetRetiredEvent
)]
mod governance {
    use super::*;

    enable_method_auth! {
        roles {
            owner => updatable_by: [];
        },
        methods {
            // Public methods
            make_temperature_check => PUBLIC;
            vote_on_temperature_check => PUBLIC;
            vote_on_proposal => PUBLIC;
            get_temperature_check_count => PUBLIC;
            get_proposal_count => PUBLIC;
            // Owner-only methods
            make_proposal => restrict_to: [owner];
            add_governance_parameter_set => restrict_to: [owner];
            update_governance_parameter_set => restrict_to: [owner];
            retire_governance_parameter_set => restrict_to: [owner];
            toggle_temperature_check_hidden => restrict_to: [owner];
            toggle_proposal_hidden => restrict_to: [owner];
        }
    }

    struct Governance {
        pub parameter_sets: KeyValueStore<String, GovernanceParameterSet>,
        pub temperature_checks: KeyValueStore<u64, TemperatureCheck>,
        pub temperature_check_count: u64,
        pub proposals: KeyValueStore<u64, Proposal>,
        pub proposal_count: u64,
    }

    impl Governance {
        /// Instantiates the governance component with the given owner badge
        pub fn instantiate(
            owner_badge: ResourceAddress,
            default_parameter_set: GovernanceParameterSetInput,
        ) -> Global<Governance> {
            Self::validate_parameter_set_input(&default_parameter_set);

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
            }
            .instantiate()
            .prepare_to_globalize(OwnerRole::Fixed(rule!(require(owner_badge))))
            .roles(roles! {
                owner => rule!(require(owner_badge));
            })
            .enable_component_royalties(component_royalties! {
                init {
                    make_temperature_check => Free, updatable;
                    make_proposal => Free, updatable;
                    vote_on_temperature_check => Free, updatable;
                    vote_on_proposal => Free, updatable;
                    get_temperature_check_count => Free, updatable;
                    get_proposal_count => Free, updatable;
                    add_governance_parameter_set => Free, updatable;
                    update_governance_parameter_set => Free, updatable;
                    retire_governance_parameter_set => Free, updatable;
                    toggle_temperature_check_hidden => Free, updatable;
                    toggle_proposal_hidden => Free, updatable;
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

        fn validate_governance_parameters(parameters: &GovernanceParameters) {
            assert!(
                parameters.temperature_check_days > 0,
                "Temperature check duration must be greater than zero"
            );
            assert!(
                parameters.proposal_length_days > 0,
                "Proposal duration must be greater than zero"
            );
            assert!(
                parameters.temperature_check_quorum > Decimal::ZERO,
                "Temperature check quorum must be greater than zero"
            );
            assert!(
                parameters.proposal_quorum > Decimal::ZERO,
                "Proposal quorum must be greater than zero"
            );
            assert!(
                parameters.temperature_check_approval_threshold > Decimal::ZERO
                    && parameters.temperature_check_approval_threshold <= Decimal::ONE,
                "Temperature check approval threshold must be greater than zero and at most one"
            );
            assert!(
                parameters.proposal_approval_threshold > Decimal::ZERO
                    && parameters.proposal_approval_threshold <= Decimal::ONE,
                "Proposal approval threshold must be greater than zero and at most one"
            );
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

        /// Creates a temperature check from the draft
        /// Returns the ID of the created temperature check
        ///
        /// # Arguments
        /// * `author` - The account creating the temperature check (must prove ownership)
        /// * `draft` - The temperature check draft data
        pub fn make_temperature_check(
            &mut self,
            author: Global<Account>,
            draft: TemperatureCheckDraft,
            parameter_set_id: Option<String>,
        ) -> u64 {
            // Verify the author account is present in the transaction
            Runtime::assert_access_rule(author.get_owner_role().rule);

            // Validate inputs
            assert!(
                !draft.title.is_empty(),
                "Temperature check title cannot be empty"
            );
            assert!(
                !draft.short_description.is_empty(),
                "Temperature check short description cannot be empty"
            );
            assert!(
                !draft.description.is_empty(),
                "Temperature check description cannot be empty"
            );
            assert!(
                !draft.vote_options.is_empty(),
                "Temperature check must have at least one vote option"
            );
            assert!(
                draft.vote_options.len() <= MAX_VOTE_OPTIONS,
                "Too many vote options (max {})",
                MAX_VOTE_OPTIONS
            );
            assert!(
                draft.links.len() <= MAX_LINKS,
                "Too many links (max {})",
                MAX_LINKS
            );

            // Validate max_selections
            if let Some(n) = draft.max_selections {
                assert!(n > 0, "max_selections must be greater than 0");
                assert!(
                    n <= MAX_SELECTIONS,
                    "max_selections cannot exceed {}",
                    MAX_SELECTIONS
                );
                assert!(
                    (n as usize) <= draft.vote_options.len(),
                    "max_selections cannot exceed number of vote options"
                );
            }

            let parameter_set = self.resolve_parameter_set(parameter_set_id);

            // Auto-generate IDs for vote options (0, 1, 2, ...)
            let vote_options: Vec<ProposalVoteOption> = draft
                .vote_options
                .into_iter()
                .enumerate()
                .map(|(index, input)| ProposalVoteOption {
                    id: ProposalVoteOptionId(index as u32),
                    label: input.label,
                })
                .collect();

            let id = self.temperature_check_count;
            self.temperature_check_count += 1;

            let now = Clock::current_time_rounded_to_seconds();
            let deadline = now
                .add_days(parameter_set.parameters.temperature_check_days as i64)
                .unwrap();

            let temperature_check = TemperatureCheck {
                title: draft.title,
                short_description: draft.short_description,
                description: draft.description,
                vote_options,
                links: draft.links,
                parameter_set,
                max_selections: draft.max_selections,
                voters: KeyValueStore::new(),
                votes: KeyValueStore::new(),
                vote_count: 0,
                revote_count: 0,
                start: now,
                deadline,
                elevated_proposal_id: None,
                author,
                hidden: false,
            };

            let title = temperature_check.title.clone();
            let start = temperature_check.start;
            let deadline = temperature_check.deadline;
            let parameter_set_id = temperature_check.parameter_set.id.clone();
            let parameter_set_version = temperature_check.parameter_set.version;

            self.temperature_checks.insert(id, temperature_check);

            Runtime::emit_event(TemperatureCheckCreatedEvent {
                temperature_check_id: id,
                title,
                start,
                deadline,
                parameter_set_id,
                parameter_set_version,
            });

            id
        }

        /// Elevates a temperature check to a proposal (GP - Governance Proposal)
        /// Only callable by the owner
        ///
        /// # Arguments
        /// * `temperature_check_id` - The ID of the temperature check to elevate
        ///
        /// Returns the ID of the created proposal
        pub fn make_proposal(&mut self, temperature_check_id: u64) -> u64 {
            // Get the temperature check
            let mut tc = self
                .temperature_checks
                .get_mut(&temperature_check_id)
                .expect("Temperature check not found");

            assert!(
                tc.elevated_proposal_id.is_none(),
                "Temperature check has already been elevated to a proposal"
            );

            let proposal_id = self.proposal_count;
            self.proposal_count += 1;

            let now = Clock::current_time_rounded_to_seconds();
            let deadline = now
                .add_days(tc.parameter_set.parameters.proposal_length_days as i64)
                .unwrap();

            let proposal = Proposal {
                title: tc.title.clone(),
                short_description: tc.short_description.clone(),
                description: tc.description.clone(),
                vote_options: tc.vote_options.clone(),
                links: tc.links.clone(),
                parameter_set: tc.parameter_set.clone(),
                max_selections: tc.max_selections,
                voters: KeyValueStore::new(),
                votes: KeyValueStore::new(),
                vote_count: 0,
                revote_count: 0,
                start: now,
                deadline,
                temperature_check_id,
                author: tc.author,
                hidden: false,
            };

            tc.elevated_proposal_id = Some(proposal_id);
            drop(tc);

            let title = proposal.title.clone();
            let start = proposal.start;
            let deadline = proposal.deadline;
            let parameter_set_id = proposal.parameter_set.id.clone();
            let parameter_set_version = proposal.parameter_set.version;

            self.proposals.insert(proposal_id, proposal);

            Runtime::emit_event(ProposalCreatedEvent {
                proposal_id,
                temperature_check_id,
                title,
                start,
                deadline,
                parameter_set_id,
                parameter_set_version,
            });

            proposal_id
        }

        /// Vote on a temperature check
        /// The account must prove its presence
        pub fn vote_on_temperature_check(
            &mut self,
            account: Global<Account>,
            temperature_check_id: u64,
            vote: TemperatureCheckVote,
        ) {
            // Verify the account is present in the transaction
            Runtime::assert_access_rule(account.get_owner_role().rule);

            // Get the temperature check
            let mut tc = self
                .temperature_checks
                .get_mut(&temperature_check_id)
                .expect("Temperature check not found");

            // Check the vote is still open
            let now = Clock::current_time_rounded_to_seconds();
            assert!(
                now.compare(tc.start, TimeComparisonOperator::Gte),
                "Voting has not started yet"
            );
            assert!(
                now.compare(tc.deadline, TimeComparisonOperator::Lt),
                "Voting has ended"
            );

            // Check if the account has already voted (revote scenario)
            let old_vote_id = tc.voters.get(&account).map(|e| e.vote_id);
            let replacing_vote_id = if let Some(id) = old_vote_id {
                tc.revote_count += 1;
                Some(id)
            } else {
                None
            };

            // Get the vote ID and increment the counter
            let vote_id = tc.vote_count;
            tc.vote_count += 1;

            // Record the vote in both stores (insert replaces existing entry for the account)
            tc.voters
                .insert(account, TemperatureCheckVoterEntry { vote_id, vote });
            tc.votes.insert(
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

        /// Vote on a proposal
        /// The account must prove its presence
        ///
        /// # Arguments
        /// * `account` - The account casting the vote
        /// * `proposal_id` - The ID of the proposal to vote on
        /// * `options` - The selected option(s):
        ///   - For single-choice proposals: provide exactly one option
        ///   - For multiple-choice proposals: provide up to max_selections options
        pub fn vote_on_proposal(
            &mut self,
            account: Global<Account>,
            proposal_id: u64,
            options: Vec<ProposalVoteOptionId>,
        ) {
            // Verify the account is present in the transaction
            Runtime::assert_access_rule(account.get_owner_role().rule);

            // Get the proposal
            let mut proposal = self
                .proposals
                .get_mut(&proposal_id)
                .expect("Proposal not found");

            // Check the vote is still open
            let now = Clock::current_time_rounded_to_seconds();
            assert!(
                now.compare(proposal.start, TimeComparisonOperator::Gte),
                "Voting has not started yet"
            );
            assert!(
                now.compare(proposal.deadline, TimeComparisonOperator::Lt),
                "Voting has ended"
            );

            // Validate option count based on max_selections
            assert!(!options.is_empty(), "Must select at least one option");

            match proposal.max_selections {
                None => {
                    // Single choice: exactly one option
                    assert!(
                        options.len() == 1,
                        "This is a single-choice proposal, select exactly one option"
                    );
                }
                Some(max) => {
                    // Multiple choice: up to max options
                    assert!(
                        options.len() <= max as usize,
                        "Cannot select more than {} options",
                        max
                    );
                }
            }

            // Check for duplicate selections
            let mut seen = Vec::new();
            for option in &options {
                assert!(!seen.contains(option), "Duplicate vote option selected");
                seen.push(*option);
            }

            // Validate all selected options exist
            for option in &options {
                assert!(
                    proposal.vote_options.iter().any(|opt| opt.id == *option),
                    "Invalid vote option"
                );
            }

            // Check if the account has already voted (revote scenario)
            let old_vote_id = proposal.voters.get(&account).map(|e| e.vote_id);
            let replacing_vote_id = if let Some(id) = old_vote_id {
                proposal.revote_count += 1;
                Some(id)
            } else {
                None
            };

            // Get the vote ID and increment the counter
            let vote_id = proposal.vote_count;
            proposal.vote_count += 1;

            // Record the vote in both stores (insert replaces existing entry for the account)
            proposal.voters.insert(
                account,
                ProposalVoterEntry {
                    vote_id,
                    options: options.clone(),
                },
            );
            proposal.votes.insert(
                vote_id,
                ProposalVoteRecord {
                    voter: account,
                    options: options.clone(),
                    replacing_vote_id,
                },
            );

            Runtime::emit_event(ProposalVotedEvent {
                proposal_id,
                vote_id,
                account,
                options,
                replacing_vote_id,
            });
        }

        /// Returns the current temperature check count
        pub fn get_temperature_check_count(&self) -> u64 {
            self.temperature_check_count
        }

        /// Returns the current proposal count
        pub fn get_proposal_count(&self) -> u64 {
            self.proposal_count
        }

        /// Adds a new active governance parameter set (owner only).
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

        /// Updates an active governance parameter set and increments its version (owner only).
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

        /// Permanently retires a non-default governance parameter set (owner only).
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

        /// Toggles the hidden flag on a temperature check (owner only)
        pub fn toggle_temperature_check_hidden(&mut self, temperature_check_id: u64) {
            let mut tc = self
                .temperature_checks
                .get_mut(&temperature_check_id)
                .expect("Temperature check not found");

            tc.hidden = !tc.hidden;
        }

        /// Toggles the hidden flag on a proposal (owner only)
        pub fn toggle_proposal_hidden(&mut self, proposal_id: u64) {
            let mut proposal = self
                .proposals
                .get_mut(&proposal_id)
                .expect("Proposal not found");

            proposal.hidden = !proposal.hidden;
        }
    }
}
