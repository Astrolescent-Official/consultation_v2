use scrypto::prelude::*;

pub mod governance;
pub mod vote_delegation;

// =============================================================================
// Shared vote types
// =============================================================================

#[derive(ScryptoSbor, ManifestSbor, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TemperatureCheckVote {
    For,
    Against,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct TemperatureCheckVoteRecord {
    pub voter: Global<Account>,
    pub vote: TemperatureCheckVote,
    pub replacing_vote_id: Option<u64>,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct TemperatureCheckVoterEntry {
    pub vote_id: u64,
    pub vote: TemperatureCheckVote,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct ProposalVoteRecord {
    pub voter: Global<Account>,
    pub options: Vec<ProposalVoteOptionId>,
    pub replacing_vote_id: Option<u64>,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct ProposalVoterEntry {
    pub vote_id: u64,
    pub options: Vec<ProposalVoteOptionId>,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProposalVoteOptionId(pub u32);

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug)]
pub struct ProposalVoteOptionInput {
    pub label: String,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug, PartialEq, Eq)]
pub struct ProposalVoteOption {
    pub id: ProposalVoteOptionId,
    pub label: String,
}

pub const MAX_LINKS: usize = 10;
pub const MAX_CANDIDATE_LINKS: usize = 5;
pub const MAX_VOTE_OPTIONS: usize = 10;
pub const MAX_SELECTIONS: u32 = 5;
pub const MIN_MAJORITY_JUDGMENT_CANDIDATES: usize = 2;
pub const MAX_MAJORITY_JUDGMENT_CANDIDATES: usize = 20;

// =============================================================================
// Governance parameter registry
// =============================================================================

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug, PartialEq)]
pub struct TemperatureCheckParameters {
    pub voting_days: u32,
    pub quorum: Decimal,
    pub approval_threshold: Decimal,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug, PartialEq)]
pub struct StandardProposalParameters {
    pub voting_days: u32,
    pub quorum: Decimal,
    pub approval_threshold: Decimal,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Grade {
    Poor,
    Acceptable,
    Good,
    VeryGood,
    Excellent,
}

impl Grade {
    pub fn score(self) -> u8 {
        match self {
            Self::Poor => 0,
            Self::Acceptable => 1,
            Self::Good => 2,
            Self::VeryGood => 3,
            Self::Excellent => 4,
        }
    }
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug, PartialEq)]
pub struct MajorityJudgmentParameters {
    pub voting_days: u32,
    pub quorum: Decimal,
    pub minimum_median_grade: Grade,
    pub rerun_voting_days: u32,
    pub rerun_quorum: Decimal,
    pub rerun_minimum_median_grade: Grade,
    pub reserve_list_days: u32,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug, PartialEq)]
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

impl GovernanceProcessParameters {
    pub fn temperature_check(&self) -> &TemperatureCheckParameters {
        match self {
            Self::Standard {
                temperature_check, ..
            }
            | Self::MajorityJudgment {
                temperature_check, ..
            } => temperature_check,
        }
    }

    pub fn same_variant(&self, other: &Self) -> bool {
        matches!(
            (self, other),
            (Self::Standard { .. }, Self::Standard { .. })
                | (Self::MajorityJudgment { .. }, Self::MajorityJudgment { .. })
        )
    }
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug)]
pub struct GovernanceParameterSetInput {
    pub label: String,
    pub parameters: GovernanceProcessParameters,
}

#[derive(ScryptoSbor, Clone, Debug, PartialEq)]
pub struct GovernanceParameterSet {
    pub label: String,
    pub version: u32,
    pub retired: bool,
    pub parameters: GovernanceProcessParameters,
}

#[derive(ScryptoSbor, Clone, Debug, PartialEq)]
pub struct GovernanceParameterSetSnapshot {
    pub id: String,
    pub label: String,
    pub version: u32,
    pub parameters: GovernanceProcessParameters,
}

pub const DEFAULT_PARAMETER_SET_ID: &str = "default";
pub const MAX_PARAMETER_SET_ID_BYTES: usize = 64;
pub const MAX_PARAMETER_SET_LABEL_BYTES: usize = 128;

// =============================================================================
// Consultation drafts and stored follow-ups
// =============================================================================

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug)]
pub struct MajorityJudgmentCandidateInput {
    pub reference: String,
    pub display_name: String,
    pub description: String,
    pub links: Vec<Url>,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct MajorityJudgmentCandidateId(pub u32);

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug, PartialEq)]
pub struct MajorityJudgmentCandidate {
    pub id: MajorityJudgmentCandidateId,
    pub reference: String,
    pub display_name: String,
    pub description: String,
    pub links: Vec<Url>,
    pub display_order: u32,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug)]
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

#[derive(ScryptoSbor, Clone, Debug, PartialEq)]
pub enum TemperatureCheckFollowUp {
    StandardProposal {
        vote_options: Vec<ProposalVoteOption>,
        max_selections: Option<u32>,
    },
    MajorityJudgmentElection {
        role_id: String,
        seat_count: u32,
        candidates: Vec<MajorityJudgmentCandidate>,
    },
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Debug)]
pub struct TemperatureCheckDraft {
    pub title: String,
    pub short_description: String,
    pub description: String,
    pub links: Vec<Url>,
    pub follow_up: TemperatureCheckFollowUpDraft,
}

#[derive(ScryptoSbor, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConsultationContinuation {
    Proposal(u64),
    MajorityJudgmentElection(u64),
}

#[derive(ScryptoSbor, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TemperatureCheckOutcome {
    Passed { recorded_at: Instant },
    Failed { recorded_at: Instant },
}

impl TemperatureCheckOutcome {
    pub fn passed(self) -> bool {
        matches!(self, Self::Passed { .. })
    }

    pub fn recorded_at(self) -> Instant {
        match self {
            Self::Passed { recorded_at } | Self::Failed { recorded_at } => recorded_at,
        }
    }
}

#[derive(ScryptoSbor)]
pub struct TemperatureCheck {
    pub title: String,
    pub short_description: String,
    pub description: String,
    pub links: Vec<Url>,
    pub follow_up: TemperatureCheckFollowUp,
    pub parameter_set: GovernanceParameterSetSnapshot,
    pub voters: KeyValueStore<Global<Account>, TemperatureCheckVoterEntry>,
    pub votes: KeyValueStore<u64, TemperatureCheckVoteRecord>,
    pub vote_count: u64,
    pub revote_count: u64,
    pub snapshot: Instant,
    pub start: Instant,
    pub deadline: Instant,
    pub outcome: Option<TemperatureCheckOutcome>,
    pub continuation: Option<ConsultationContinuation>,
    pub author: Global<Account>,
    pub hidden: bool,
}

#[derive(ScryptoSbor)]
pub struct Proposal {
    pub title: String,
    pub short_description: String,
    pub description: String,
    pub vote_options: Vec<ProposalVoteOption>,
    pub links: Vec<Url>,
    pub parameter_set: GovernanceParameterSetSnapshot,
    pub max_selections: Option<u32>,
    pub voters: KeyValueStore<Global<Account>, ProposalVoterEntry>,
    pub votes: KeyValueStore<u64, ProposalVoteRecord>,
    pub vote_count: u64,
    pub revote_count: u64,
    pub start: Instant,
    pub deadline: Instant,
    pub temperature_check_id: u64,
    pub author: Global<Account>,
    pub hidden: bool,
}

// =============================================================================
// Majority Judgment elections
// =============================================================================

#[derive(ScryptoSbor, ManifestSbor, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MajorityJudgmentRoundId {
    RoundOne,
    Rerun,
}

#[derive(ScryptoSbor, ManifestSbor, Clone, Copy, Debug, PartialEq, Eq)]
pub struct CandidateGrade {
    pub candidate_id: MajorityJudgmentCandidateId,
    pub grade: Grade,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct MajorityJudgmentVoteRecord {
    pub voter: Global<Account>,
    pub grades: Vec<CandidateGrade>,
    pub replacing_vote_id: Option<u64>,
}

#[derive(ScryptoSbor, Clone, Debug)]
pub struct MajorityJudgmentVoterEntry {
    pub vote_id: u64,
    pub grades: Vec<CandidateGrade>,
}

#[derive(ScryptoSbor)]
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

#[derive(ScryptoSbor, Clone, Debug, PartialEq, Eq)]
pub struct MajorityJudgmentTieResolution {
    pub round: MajorityJudgmentRoundId,
    pub ordered_candidate_ids: Vec<MajorityJudgmentCandidateId>,
    pub recorded_at: Instant,
}

#[derive(ScryptoSbor)]
pub struct MajorityJudgmentElection {
    pub temperature_check_id: u64,
    pub round_one: MajorityJudgmentRound,
    pub rerun: Option<MajorityJudgmentRound>,
    pub tie_resolution: Option<MajorityJudgmentTieResolution>,
    pub hidden: bool,
}

// =============================================================================
// Delegation
// =============================================================================

pub const MAX_DELEGATIONS: usize = 50;
pub const MIN_DELEGATION_FRACTION: &str = "0.01";

#[derive(ScryptoSbor, Clone, Debug)]
pub struct Delegation {
    pub delegatee: Global<Account>,
    pub fraction: Decimal,
    pub valid_until: Instant,
}

// =============================================================================
// Events
// =============================================================================

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct TemperatureCheckCreatedEvent {
    pub temperature_check_id: u64,
    pub title: String,
    pub snapshot: Instant,
    pub start: Instant,
    pub deadline: Instant,
    pub parameter_set_id: String,
    pub parameter_set_version: u32,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct TemperatureCheckOutcomeRecordedEvent {
    pub temperature_check_id: u64,
    pub passed: bool,
    pub recorded_at: Instant,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct TemperatureCheckVotedEvent {
    pub temperature_check_id: u64,
    pub vote_id: u64,
    pub account: Global<Account>,
    pub vote: TemperatureCheckVote,
    pub replacing_vote_id: Option<u64>,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub temperature_check_id: u64,
    pub title: String,
    pub start: Instant,
    pub deadline: Instant,
    pub parameter_set_id: String,
    pub parameter_set_version: u32,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct ProposalVotedEvent {
    pub proposal_id: u64,
    pub vote_id: u64,
    pub account: Global<Account>,
    pub options: Vec<ProposalVoteOptionId>,
    pub replacing_vote_id: Option<u64>,
}

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

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct MajorityJudgmentElectionCreatedEvent {
    pub election_id: u64,
    pub temperature_check_id: u64,
    pub role_id: String,
    pub seat_count: u32,
    pub snapshot: Instant,
    pub voting_start: Instant,
    pub voting_deadline: Instant,
    pub parameter_set_id: String,
    pub parameter_set_version: u32,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct MajorityJudgmentElectionVotedEvent {
    pub election_id: u64,
    pub round: MajorityJudgmentRoundId,
    pub vote_id: u64,
    pub account: Global<Account>,
    pub grades: Vec<CandidateGrade>,
    pub replacing_vote_id: Option<u64>,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct MajorityJudgmentRerunStartedEvent {
    pub election_id: u64,
    pub snapshot: Instant,
    pub start: Instant,
    pub deadline: Instant,
    pub quorum: Decimal,
    pub minimum_median_grade: Grade,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct MajorityJudgmentTieResolutionRecordedEvent {
    pub election_id: u64,
    pub round: MajorityJudgmentRoundId,
    pub ordered_candidate_ids: Vec<MajorityJudgmentCandidateId>,
    pub recorded_at: Instant,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct MajorityJudgmentElectionHiddenToggledEvent {
    pub election_id: u64,
    pub hidden: bool,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct DelegationCreatedEvent {
    pub delegator: Global<Account>,
    pub delegatee: Global<Account>,
    pub fraction: Decimal,
    pub valid_until: Instant,
}

#[derive(ScryptoSbor, ScryptoEvent, Clone, Debug)]
pub struct DelegationRemovedEvent {
    pub delegator: Global<Account>,
    pub delegatee: Global<Account>,
}
