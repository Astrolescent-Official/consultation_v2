import { Schema } from 'effect'
import s from 'sbor-ez-mode'

// SBOR schemas for the current Governance and VoteDelegation package.
// Keep field names, tuple wrappers, and enum variants synchronized with the
// Scrypto types in scrypto/src/lib.rs.

export const VoteDelegation = s.struct({
  delegatees: s.internalAddress(),
  delegators: s.internalAddress()
})

export const TemperatureCheckParameters = s.struct({
  voting_days: s.number(),
  quorum: s.decimal(),
  approval_threshold: s.decimal()
})

export const StandardProposalParameters = s.struct({
  voting_days: s.number(),
  quorum: s.decimal(),
  approval_threshold: s.decimal()
})

export const Grade = s.enum([
  { variant: 'Poor', schema: s.tuple([]) },
  { variant: 'Acceptable', schema: s.tuple([]) },
  { variant: 'Good', schema: s.tuple([]) },
  { variant: 'VeryGood', schema: s.tuple([]) },
  { variant: 'Excellent', schema: s.tuple([]) }
])

export const MajorityJudgmentParameters = s.struct({
  review_days: s.number(),
  voting_days: s.number(),
  quorum: s.decimal(),
  minimum_median_grade: Grade,
  rerun_voting_days: s.number(),
  rerun_quorum: s.decimal(),
  rerun_minimum_median_grade: Grade,
  reserve_list_days: s.number()
})

export const GovernanceProcessParameters = s.enum([
  {
    variant: 'Standard',
    schema: s.struct({
      temperature_check: TemperatureCheckParameters,
      proposal: StandardProposalParameters
    })
  },
  {
    variant: 'MajorityJudgment',
    schema: s.struct({
      temperature_check: TemperatureCheckParameters,
      election: MajorityJudgmentParameters
    })
  }
])

// Retained as an export alias for code importing the pre-tagged schema name.
export const GovernanceParameters = GovernanceProcessParameters

export const GovernanceParameterSet = s.struct({
  label: s.string(),
  version: s.number(),
  retired: s.bool(),
  parameters: GovernanceProcessParameters
})

export const GovernanceParameterSetSnapshot = s.struct({
  id: s.string(),
  label: s.string(),
  version: s.number(),
  parameters: GovernanceProcessParameters
})

export const ProposalVoteOptionId = s.tuple([s.number()])

export const ProposalVoteOption = s.struct({
  id: ProposalVoteOptionId,
  label: s.string()
})

export const MajorityJudgmentCandidateId = s.tuple([s.number()])

export const MajorityJudgmentCandidate = s.struct({
  id: MajorityJudgmentCandidateId,
  reference: s.string(),
  display_name: s.string(),
  description: s.string(),
  links: s.array(s.string()),
  display_order: s.number()
})

export const CandidateGrade = s.struct({
  candidate_id: MajorityJudgmentCandidateId,
  grade: Grade
})

export const TemperatureCheckFollowUp = s.enum([
  {
    variant: 'StandardProposal',
    schema: s.struct({
      vote_options: s.array(ProposalVoteOption),
      max_selections: s.option(s.number())
    })
  },
  {
    variant: 'MajorityJudgmentElection',
    schema: s.struct({
      role_id: s.string(),
      seat_count: s.number(),
      candidates: s.array(MajorityJudgmentCandidate)
    })
  }
])

export const ConsultationContinuation = s.enum([
  {
    variant: 'Proposal',
    schema: s.tuple([s.number()])
  },
  {
    variant: 'MajorityJudgmentElection',
    schema: s.tuple([s.number()])
  }
])

export const MajorityJudgmentRoundId = s.enum([
  { variant: 'RoundOne', schema: s.tuple([]) },
  { variant: 'Rerun', schema: s.tuple([]) }
])

export const MajorityJudgmentRound = s.struct({
  snapshot: s.instant(),
  start: s.instant(),
  deadline: s.instant(),
  quorum: s.decimal(),
  minimum_median_grade: Grade,
  voters: s.internalAddress(),
  votes: s.internalAddress(),
  vote_count: s.number(),
  revote_count: s.number()
})

export const MajorityJudgmentTieResolution = s.struct({
  round: MajorityJudgmentRoundId,
  ordered_candidate_ids: s.array(MajorityJudgmentCandidateId),
  recorded_at: s.instant()
})

export const Governance = s.struct({
  parameter_sets: s.internalAddress(),
  temperature_checks: s.internalAddress(),
  temperature_check_count: s.number(),
  proposals: s.internalAddress(),
  proposal_count: s.number(),
  majority_judgment_elections: s.internalAddress(),
  majority_judgment_election_count: s.number()
})

export const GovernanceParameterSetKeyValueStoreKey = s.string()
export const GovernanceParameterSetKeyValueStoreValue = GovernanceParameterSet

export const TemperatureCheckKeyValueStoreKey = s.number()
export const TemperatureCheckKeyValueStoreValue = s.struct({
  title: s.string(),
  short_description: s.string(),
  description: s.string(),
  links: s.array(s.string()),
  follow_up: TemperatureCheckFollowUp,
  parameter_set: GovernanceParameterSetSnapshot,
  voters: s.internalAddress(),
  votes: s.internalAddress(),
  vote_count: s.number(),
  revote_count: s.number(),
  start: s.instant(),
  deadline: s.instant(),
  continuation: s.option(ConsultationContinuation),
  author: s.address(),
  hidden: s.bool()
})

export const KeyValueStoreAddress = Schema.String.pipe(
  Schema.brand('KeyValueStoreAddress')
)
export type KeyValueStoreAddress = typeof KeyValueStoreAddress.Type

export const TemperatureCheckVote = s.enum([
  { variant: 'For', schema: s.tuple([]) },
  { variant: 'Against', schema: s.tuple([]) }
])

export const TemperatureCheckVoteKeyValueStoreKey = s.number()
export const TemperatureCheckVoteKeyValueStoreValue = s.struct({
  voter: s.address(),
  vote: TemperatureCheckVote,
  replacing_vote_id: s.option(s.number())
})

export const TemperatureCheckVotersKeyValueStoreKey = s.address()
export const TemperatureCheckVotersKeyValueStoreValue = s.struct({
  vote_id: s.number(),
  vote: TemperatureCheckVote
})

export const ProposalKeyValueStoreKey = s.number()
export const ProposalKeyValueStoreValue = s.struct({
  title: s.string(),
  short_description: s.string(),
  description: s.string(),
  vote_options: s.array(ProposalVoteOption),
  links: s.array(s.string()),
  parameter_set: GovernanceParameterSetSnapshot,
  max_selections: s.option(s.number()),
  voters: s.internalAddress(),
  votes: s.internalAddress(),
  vote_count: s.number(),
  revote_count: s.number(),
  start: s.instant(),
  deadline: s.instant(),
  temperature_check_id: s.number(),
  author: s.address(),
  hidden: s.bool()
})

export const ProposalVoteKeyValueStoreKey = s.number()
export const ProposalVoteKeyValueStoreValue = s.struct({
  voter: s.address(),
  options: s.array(ProposalVoteOptionId),
  replacing_vote_id: s.option(s.number())
})

export const ProposalVotersKeyValueStoreKey = s.address()
export const ProposalVotersKeyValueStoreValue = s.struct({
  vote_id: s.number(),
  options: s.array(ProposalVoteOptionId)
})

export const MajorityJudgmentElectionKeyValueStoreKey = s.number()
export const MajorityJudgmentElectionKeyValueStoreValue = s.struct({
  temperature_check_id: s.number(),
  title: s.string(),
  short_description: s.string(),
  description: s.string(),
  links: s.array(s.string()),
  author: s.address(),
  role_id: s.string(),
  seat_count: s.number(),
  candidates: s.array(MajorityJudgmentCandidate),
  parameter_set: GovernanceParameterSetSnapshot,
  review_start: s.instant(),
  review_end: s.instant(),
  round_one: MajorityJudgmentRound,
  rerun: s.option(MajorityJudgmentRound),
  tie_resolution: s.option(MajorityJudgmentTieResolution),
  hidden: s.bool()
})

export const MajorityJudgmentVoteKeyValueStoreKey = s.number()
export const MajorityJudgmentVoteKeyValueStoreValue = s.struct({
  voter: s.address(),
  grades: s.array(CandidateGrade),
  replacing_vote_id: s.option(s.number())
})

export const MajorityJudgmentVotersKeyValueStoreKey = s.address()
export const MajorityJudgmentVotersKeyValueStoreValue = s.struct({
  vote_id: s.number(),
  grades: s.array(CandidateGrade)
})

export const TemperatureCheckCreatedEvent = s.struct({
  temperature_check_id: s.number(),
  title: s.string(),
  start: s.instant(),
  deadline: s.instant(),
  parameter_set_id: s.string(),
  parameter_set_version: s.number()
})

export const TemperatureCheckVotedEvent = s.struct({
  temperature_check_id: s.number(),
  vote_id: s.number(),
  account: s.address(),
  vote: TemperatureCheckVote,
  replacing_vote_id: s.option(s.number())
})

export const ProposalCreatedEvent = s.struct({
  proposal_id: s.number(),
  temperature_check_id: s.number(),
  title: s.string(),
  start: s.instant(),
  deadline: s.instant(),
  parameter_set_id: s.string(),
  parameter_set_version: s.number()
})

export const ProposalVotedEvent = s.struct({
  proposal_id: s.number(),
  vote_id: s.number(),
  account: s.address(),
  options: s.array(ProposalVoteOptionId),
  replacing_vote_id: s.option(s.number())
})

export const GovernanceParameterSetAddedEvent = s.struct({
  parameter_set_id: s.string(),
  parameter_set: GovernanceParameterSet
})

export const GovernanceParameterSetUpdatedEvent = s.struct({
  parameter_set_id: s.string(),
  previous_version: s.number(),
  parameter_set: GovernanceParameterSet
})

export const GovernanceParameterSetRetiredEvent = s.struct({
  parameter_set_id: s.string(),
  version: s.number()
})

export const MajorityJudgmentElectionCreatedEvent = s.struct({
  election_id: s.number(),
  temperature_check_id: s.number(),
  role_id: s.string(),
  seat_count: s.number(),
  review_start: s.instant(),
  review_end: s.instant(),
  snapshot: s.instant(),
  voting_start: s.instant(),
  voting_deadline: s.instant(),
  parameter_set_id: s.string(),
  parameter_set_version: s.number()
})

export const MajorityJudgmentElectionVotedEvent = s.struct({
  election_id: s.number(),
  round: MajorityJudgmentRoundId,
  vote_id: s.number(),
  account: s.address(),
  grades: s.array(CandidateGrade),
  replacing_vote_id: s.option(s.number())
})

export const MajorityJudgmentRerunStartedEvent = s.struct({
  election_id: s.number(),
  snapshot: s.instant(),
  start: s.instant(),
  deadline: s.instant(),
  quorum: s.decimal(),
  minimum_median_grade: Grade
})

export const MajorityJudgmentTieResolutionRecordedEvent = s.struct({
  election_id: s.number(),
  round: MajorityJudgmentRoundId,
  ordered_candidate_ids: s.array(MajorityJudgmentCandidateId),
  recorded_at: s.instant()
})

export const MajorityJudgmentElectionHiddenToggledEvent = s.struct({
  election_id: s.number(),
  hidden: s.bool()
})
