import { Schema } from 'effect'
import s from 'sbor-ez-mode'

// SBOR schemas for the current Governance and VoteDelegation package.
// Keep these layouts synchronized with the Scrypto types during deployment.

export const VoteDelegation = s.struct({
  delegatees: s.internalAddress(),
  delegators: s.internalAddress()
})

export const GovernanceParameters = s.struct({
  temperature_check_days: s.number(),
  temperature_check_quorum: s.decimal(),
  temperature_check_approval_threshold: s.decimal(),
  proposal_length_days: s.number(),
  proposal_quorum: s.decimal(),
  proposal_approval_threshold: s.decimal()
})

export const GovernanceParameterSet = s.struct({
  label: s.string(),
  version: s.number(),
  retired: s.bool(),
  parameters: GovernanceParameters
})

export const GovernanceParameterSetSnapshot = s.struct({
  id: s.string(),
  label: s.string(),
  version: s.number(),
  parameters: GovernanceParameters
})

export const Governance = s.struct({
  parameter_sets: s.internalAddress(),
  temperature_checks: s.internalAddress(),
  temperature_check_count: s.number(),
  proposals: s.internalAddress(),
  proposal_count: s.number()
})

export const GovernanceParameterSetKeyValueStoreKey = s.string()

export const GovernanceParameterSetKeyValueStoreValue = GovernanceParameterSet

export const TemperatureCheckKeyValueStoreKey = s.number()

export const TemperatureCheckKeyValueStoreValue = s.struct({
  title: s.string(),
  short_description: s.string(),
  description: s.string(),
  vote_options: s.array(
    s.struct({
      id: s.tuple([s.number()]),
      label: s.string()
    })
  ),
  links: s.array(s.string()),
  parameter_set: GovernanceParameterSetSnapshot,
  max_selections: s.enum([
    {
      variant: 'None',
      schema: s.structNullable({})
    },
    {
      variant: 'Some',
      schema: s.tuple([s.number()])
    }
  ]),
  voters: s.internalAddress(),
  votes: s.internalAddress(),
  vote_count: s.number(),
  revote_count: s.number(),
  start: s.number(),
  deadline: s.number(),
  elevated_proposal_id: s.enum([
    {
      variant: 'None',
      schema: s.structNullable({})
    },
    {
      variant: 'Some',
      schema: s.tuple([s.number()])
    }
  ]),
  author: s.address(),
  hidden: s.bool()
})

export const KeyValueStoreAddress = Schema.String.pipe(
  Schema.brand('KeyValueStoreAddress')
)

export type KeyValueStoreAddress = typeof KeyValueStoreAddress.Type

export const TemperatureCheckVoteKeyValueStoreKey = s.number()

export const TemperatureCheckVote = s.enum([
  { variant: 'For', schema: s.tuple([]) },
  { variant: 'Against', schema: s.tuple([]) }
])

export const TemperatureCheckVoteKeyValueStoreValue = s.struct({
  voter: s.address(),
  vote: TemperatureCheckVote,
  replacing_vote_id: s.enum([
    {
      variant: 'None',
      schema: s.structNullable({})
    },
    {
      variant: 'Some',
      schema: s.tuple([s.number()])
    }
  ])
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
  vote_options: s.array(
    s.struct({
      id: s.tuple([s.number()]),
      label: s.string()
    })
  ),
  links: s.array(s.string()),
  parameter_set: GovernanceParameterSetSnapshot,
  max_selections: s.enum([
    {
      variant: 'None',
      schema: s.structNullable({})
    },
    {
      variant: 'Some',
      schema: s.tuple([s.number()])
    }
  ]),
  voters: s.internalAddress(),
  votes: s.internalAddress(),
  vote_count: s.number(),
  revote_count: s.number(),
  start: s.number(),
  deadline: s.number(),
  temperature_check_id: s.number(),
  author: s.address(),
  hidden: s.bool()
})

export const ProposalVoteOptionId = s.tuple([s.number()])

export const ProposalVoteKeyValueStoreKey = s.number()

export const ProposalVoteKeyValueStoreValue = s.struct({
  voter: s.address(),
  options: s.array(ProposalVoteOptionId),
  replacing_vote_id: s.enum([
    {
      variant: 'None',
      schema: s.structNullable({})
    },
    {
      variant: 'Some',
      schema: s.tuple([s.number()])
    }
  ])
})

export const ProposalVotersKeyValueStoreKey = s.address()

export const ProposalVotersKeyValueStoreValue = s.struct({
  vote_id: s.number(),
  options: s.array(ProposalVoteOptionId)
})

export const TemperatureCheckVotedEvent = s.struct({
  temperature_check_id: s.number(),
  vote_id: s.number(),
  account: s.address(),
  vote: TemperatureCheckVote,
  replacing_vote_id: s.enum([
    {
      variant: 'None',
      schema: s.structNullable({})
    },
    {
      variant: 'Some',
      schema: s.tuple([s.number()])
    }
  ])
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
  replacing_vote_id: s.enum([
    {
      variant: 'None',
      schema: s.structNullable({})
    },
    {
      variant: 'Some',
      schema: s.tuple([s.number()])
    }
  ])
})

export const TemperatureCheckCreatedEvent = s.struct({
  temperature_check_id: s.number(),
  title: s.string(),
  start: s.instant(),
  deadline: s.instant(),
  parameter_set_id: s.string(),
  parameter_set_version: s.number()
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
