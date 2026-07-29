import { AccountAddress } from '@radix-effects/shared'
import type { ProgrammaticScryptoSborValue } from '@radixdlt/babylon-gateway-api-sdk'
import BigNumber from 'bignumber.js'
import { Effect, Option, ParseResult, Schema, type SchemaAST } from 'effect'
import s from 'sbor-ez-mode'
import { parseSbor } from '../helpers/parseSbor'
import { KeyValueStoreAddress, Grade as SborGrade } from '../schemas'
import { ProposalId, TemperatureCheckId } from './brandedTypes'
import {
  CandidateHttpUrlStringSchema,
  GradeSchema,
  MajorityJudgmentCandidateIdSchema,
  MajorityJudgmentElectionIdSchema,
  MajorityJudgmentRoundIdSchema
} from './majorityJudgment'

const PositiveDecimalString = Schema.String.pipe(
  Schema.filter(
    (value) => {
      const decimal = new BigNumber(value)
      return decimal.isFinite() && decimal.isGreaterThan(0)
    },
    { message: () => 'Must be a positive decimal' }
  )
)

const ApprovalThresholdString = PositiveDecimalString.pipe(
  Schema.filter((value) => new BigNumber(value).isLessThanOrEqualTo(1), {
    message: () => 'Must be greater than zero and at most one'
  })
)

const DurationDays = Schema.Number.pipe(
  Schema.int(),
  Schema.between(1, 4_294_967_295)
)

const ScryptoOptionalNumberSchema = Schema.Union(
  Schema.Struct({ variant: Schema.Literal('None') }),
  Schema.Struct({
    variant: Schema.Literal('Some'),
    value: Schema.Number
  })
)

const encodeScryptoOptionalNumber = (value: number | undefined) =>
  value === undefined
    ? { variant: 'None' as const }
    : { variant: 'Some' as const, value }

const numberTuple = (value: number): readonly [number] => [value]
const candidateIdTuple = (
  value: number
): readonly [typeof MajorityJudgmentCandidateIdSchema.Type] => [
  MajorityJudgmentCandidateIdSchema.make(value)
]

const TemperatureCheckParametersEncodedSchema = Schema.Struct({
  voting_days: DurationDays,
  quorum: PositiveDecimalString,
  approval_threshold: ApprovalThresholdString
})

export const TemperatureCheckParametersSchema = Schema.transform(
  TemperatureCheckParametersEncodedSchema,
  Schema.Struct({
    votingDays: DurationDays,
    quorum: PositiveDecimalString,
    approvalThreshold: ApprovalThresholdString
  }),
  {
    strict: true,
    decode: (value) => ({
      votingDays: value.voting_days,
      quorum: value.quorum,
      approvalThreshold: value.approval_threshold
    }),
    encode: (value) => ({
      voting_days: value.votingDays,
      quorum: value.quorum,
      approval_threshold: value.approvalThreshold
    })
  }
)

const StandardProposalParametersEncodedSchema = Schema.Struct({
  voting_days: DurationDays,
  quorum: PositiveDecimalString,
  approval_threshold: ApprovalThresholdString
})

export const StandardProposalParametersSchema = Schema.transform(
  StandardProposalParametersEncodedSchema,
  Schema.Struct({
    votingDays: DurationDays,
    quorum: PositiveDecimalString,
    approvalThreshold: ApprovalThresholdString
  }),
  {
    strict: true,
    decode: (value) => ({
      votingDays: value.voting_days,
      quorum: value.quorum,
      approvalThreshold: value.approval_threshold
    }),
    encode: (value) => ({
      voting_days: value.votingDays,
      quorum: value.quorum,
      approval_threshold: value.approvalThreshold
    })
  }
)

const ScryptoGradeSchema = Schema.Struct({
  variant: Schema.Literal('Poor', 'Acceptable', 'Good', 'VeryGood', 'Excellent')
})

const decodeGrade = (
  variant: typeof ScryptoGradeSchema.Type.variant
): typeof GradeSchema.Type => {
  switch (variant) {
    case 'Poor':
      return 0
    case 'Acceptable':
      return 1
    case 'Good':
      return 2
    case 'VeryGood':
      return 3
    case 'Excellent':
      return 4
  }
}

const encodeGrade = (grade: typeof GradeSchema.Type) => {
  switch (grade) {
    case 0:
      return { variant: 'Poor' as const }
    case 1:
      return { variant: 'Acceptable' as const }
    case 2:
      return { variant: 'Good' as const }
    case 3:
      return { variant: 'VeryGood' as const }
    case 4:
      return { variant: 'Excellent' as const }
  }
}

export const ScryptoGradeToScoreSchema = Schema.transform(
  ScryptoGradeSchema,
  GradeSchema,
  {
    strict: true,
    decode: ({ variant }) => decodeGrade(variant),
    encode: encodeGrade
  }
)

const MajorityJudgmentParametersEncodedSchema = Schema.Struct({
  voting_days: DurationDays,
  quorum: PositiveDecimalString,
  minimum_median_grade: ScryptoGradeToScoreSchema,
  rerun_voting_days: DurationDays,
  rerun_quorum: PositiveDecimalString,
  rerun_minimum_median_grade: ScryptoGradeToScoreSchema,
  reserve_list_days: DurationDays
})

export const MajorityJudgmentParametersSchema = Schema.transform(
  MajorityJudgmentParametersEncodedSchema,
  Schema.Struct({
    votingDays: DurationDays,
    quorum: PositiveDecimalString,
    minimumMedianGrade: GradeSchema,
    rerunVotingDays: DurationDays,
    rerunQuorum: PositiveDecimalString,
    rerunMinimumMedianGrade: GradeSchema,
    reserveListDays: DurationDays
  }),
  {
    strict: true,
    decode: (value) => ({
      votingDays: value.voting_days,
      quorum: value.quorum,
      minimumMedianGrade: value.minimum_median_grade,
      rerunVotingDays: value.rerun_voting_days,
      rerunQuorum: value.rerun_quorum,
      rerunMinimumMedianGrade: value.rerun_minimum_median_grade,
      reserveListDays: value.reserve_list_days
    }),
    encode: (value) => ({
      voting_days: value.votingDays,
      quorum: value.quorum,
      minimum_median_grade: value.minimumMedianGrade,
      rerun_voting_days: value.rerunVotingDays,
      rerun_quorum: value.rerunQuorum,
      rerun_minimum_median_grade: value.rerunMinimumMedianGrade,
      reserve_list_days: value.reserveListDays
    })
  }
)

const StandardGovernanceParametersSchema = Schema.TaggedStruct('Standard', {
  temperatureCheck: Schema.typeSchema(TemperatureCheckParametersSchema),
  proposal: Schema.typeSchema(StandardProposalParametersSchema)
})

const MajorityJudgmentGovernanceParametersSchema = Schema.TaggedStruct(
  'MajorityJudgment',
  {
    temperatureCheck: Schema.typeSchema(TemperatureCheckParametersSchema),
    election: Schema.typeSchema(MajorityJudgmentParametersSchema)
  }
)

export const GovernanceParametersSchema = Schema.transform(
  Schema.Union(
    Schema.Struct({
      variant: Schema.Literal('Standard'),
      value: Schema.Struct({
        temperature_check: TemperatureCheckParametersSchema,
        proposal: StandardProposalParametersSchema
      })
    }),
    Schema.Struct({
      variant: Schema.Literal('MajorityJudgment'),
      value: Schema.Struct({
        temperature_check: TemperatureCheckParametersSchema,
        election: MajorityJudgmentParametersSchema
      })
    })
  ),
  Schema.Union(
    StandardGovernanceParametersSchema,
    MajorityJudgmentGovernanceParametersSchema
  ),
  {
    strict: true,
    decode: (value) =>
      value.variant === 'Standard'
        ? {
            _tag: 'Standard' as const,
            temperatureCheck: value.value.temperature_check,
            proposal: value.value.proposal
          }
        : {
            _tag: 'MajorityJudgment' as const,
            temperatureCheck: value.value.temperature_check,
            election: value.value.election
          },
    encode: (value) =>
      value._tag === 'Standard'
        ? {
            variant: 'Standard' as const,
            value: {
              temperature_check: value.temperatureCheck,
              proposal: value.proposal
            }
          }
        : {
            variant: 'MajorityJudgment' as const,
            value: {
              temperature_check: value.temperatureCheck,
              election: value.election
            }
          }
  }
)

export type GovernanceParameters = typeof GovernanceParametersSchema.Type

/**
 * The reserved parameter set the component seeds at instantiation. It remains
 * active, Standard, and is selected when a TC omits a profile identifier.
 */
export const DEFAULT_PARAMETER_SET_ID = 'default'

export const GovernanceParameterSetIdSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
)
export type GovernanceParameterSetId =
  typeof GovernanceParameterSetIdSchema.Type

export const GovernanceParameterSetLabelSchema = Schema.String.pipe(
  Schema.filter(
    (value) =>
      value.trim() === value &&
      value.trim().length > 0 &&
      new TextEncoder().encode(value).length <= 128,
    {
      message: () =>
        'Label must be non-blank, have no surrounding whitespace, and be at most 128 UTF-8 bytes'
    }
  )
)

export const GovernanceParameterSetSchema = Schema.Struct({
  id: GovernanceParameterSetIdSchema,
  label: GovernanceParameterSetLabelSchema,
  version: Schema.Number.pipe(Schema.int(), Schema.between(1, 4_294_967_295)),
  retired: Schema.Boolean,
  parameters: GovernanceParametersSchema
})
export type GovernanceParameterSet = typeof GovernanceParameterSetSchema.Type

export const GovernanceParameterSetSnapshotSchema = Schema.Struct({
  id: GovernanceParameterSetIdSchema,
  label: GovernanceParameterSetLabelSchema,
  version: Schema.Number.pipe(Schema.int(), Schema.between(1, 4_294_967_295)),
  parameters: GovernanceParametersSchema
})
export type GovernanceParameterSetSnapshot =
  typeof GovernanceParameterSetSnapshotSchema.Type

const StandardParameterSetInputSchema = Schema.TaggedStruct('Standard', {
  label: GovernanceParameterSetLabelSchema,
  temperatureCheck: Schema.typeSchema(TemperatureCheckParametersSchema),
  proposal: Schema.typeSchema(StandardProposalParametersSchema)
})

const MajorityJudgmentParameterSetInputSchema = Schema.TaggedStruct(
  'MajorityJudgment',
  {
    label: GovernanceParameterSetLabelSchema,
    temperatureCheck: Schema.typeSchema(TemperatureCheckParametersSchema),
    election: Schema.typeSchema(MajorityJudgmentParametersSchema)
  }
)

export const GovernanceParameterSetInputSchema = Schema.Union(
  StandardParameterSetInputSchema,
  MajorityJudgmentParameterSetInputSchema
)
export type GovernanceParameterSetInput =
  typeof GovernanceParameterSetInputSchema.Type

export const MakeAddGovernanceParameterSetInputSchema =
  GovernanceParameterSetInputSchema.pipe(
    Schema.extend(
      Schema.Struct({
        accountAddress: AccountAddress,
        parameterSetId: GovernanceParameterSetIdSchema
      })
    )
  )
export type MakeAddGovernanceParameterSetInput =
  typeof MakeAddGovernanceParameterSetInputSchema.Encoded

export const MakeUpdateGovernanceParameterSetInputSchema =
  MakeAddGovernanceParameterSetInputSchema
export type MakeUpdateGovernanceParameterSetInput =
  typeof MakeUpdateGovernanceParameterSetInputSchema.Encoded

export const MakeRetireGovernanceParameterSetInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  parameterSetId: GovernanceParameterSetIdSchema
})
export type MakeRetireGovernanceParameterSetInput =
  typeof MakeRetireGovernanceParameterSetInputSchema.Encoded

const byDisplayOrder = (
  left: GovernanceParameterSet,
  right: GovernanceParameterSet
) => {
  if (left.id === right.id) return 0
  if (left.id === DEFAULT_PARAMETER_SET_ID) return -1
  if (right.id === DEFAULT_PARAMETER_SET_ID) return 1
  return left.id < right.id ? -1 : 1
}

export const partitionGovernanceParameterSets = (
  parameterSets: ReadonlyArray<GovernanceParameterSet>
) => ({
  active: parameterSets
    .filter((parameterSet) => !parameterSet.retired)
    .sort(byDisplayOrder),
  retired: parameterSets
    .filter((parameterSet) => parameterSet.retired)
    .sort(byDisplayOrder)
})

const CandidateInputSchema = Schema.Struct({
  reference: Schema.String.pipe(Schema.minLength(1)),
  displayName: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.String.pipe(Schema.minLength(1)),
  links: Schema.Array(CandidateHttpUrlStringSchema).pipe(Schema.maxItems(5))
})

export const TemperatureCheckFollowUpInputSchema = Schema.Union(
  Schema.TaggedStruct('StandardProposal', {
    voteOptions: Schema.Array(Schema.String).pipe(
      Schema.minItems(2),
      Schema.maxItems(10)
    ),
    maxSelections: Schema.Number.pipe(Schema.int(), Schema.between(1, 5))
  }),
  Schema.TaggedStruct('MajorityJudgmentElection', {
    roleId: Schema.String.pipe(Schema.minLength(1)),
    seatCount: Schema.Number.pipe(Schema.int(), Schema.positive()),
    candidates: Schema.Array(CandidateInputSchema).pipe(
      Schema.minItems(2),
      Schema.maxItems(20),
      Schema.filter(
        (candidates) =>
          new Set(candidates.map(({ reference }) => reference)).size ===
          candidates.length,
        { message: () => 'Candidate references must be unique' }
      )
    )
  }).pipe(
    Schema.filter(
      ({ seatCount, candidates }) => seatCount < candidates.length,
      { message: () => 'Seat count must be less than candidate count' }
    )
  )
)

export const MakeTemperatureCheckInputSchema = Schema.Struct({
  title: Schema.String,
  shortDescription: Schema.String,
  description: Schema.String,
  links: Schema.Array(Schema.String),
  followUp: TemperatureCheckFollowUpInputSchema,
  authorAccount: AccountAddress,
  parameterSetId: GovernanceParameterSetIdSchema
})
export type MakeTemperatureCheckInput =
  typeof MakeTemperatureCheckInputSchema.Encoded

export const RecordTemperatureCheckOutcomeInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  temperatureCheckId: TemperatureCheckId,
  passed: Schema.Boolean
})
export type RecordTemperatureCheckOutcomeInput =
  typeof RecordTemperatureCheckOutcomeInputSchema.Type

const CandidateSchema = Schema.Struct({
  id: Schema.Tuple(MajorityJudgmentCandidateIdSchema),
  reference: Schema.String,
  display_name: Schema.String,
  description: Schema.String,
  links: Schema.Array(Schema.String),
  display_order: Schema.Number
})

const FollowUpEncodedSchema = Schema.Union(
  Schema.Struct({
    variant: Schema.Literal('StandardProposal'),
    value: Schema.Struct({
      vote_options: Schema.Array(
        Schema.Struct({
          id: Schema.Tuple(Schema.Number),
          label: Schema.String
        })
      ),
      max_selections: ScryptoOptionalNumberSchema
    })
  }),
  Schema.Struct({
    variant: Schema.Literal('MajorityJudgmentElection'),
    value: Schema.Struct({
      role_id: Schema.String,
      seat_count: Schema.Number,
      candidates: Schema.Array(CandidateSchema)
    })
  })
)

export const TemperatureCheckFollowUpSchema = Schema.transform(
  FollowUpEncodedSchema,
  Schema.Union(
    Schema.TaggedStruct('StandardProposal', {
      voteOptions: Schema.Array(
        Schema.Struct({ id: Schema.Number, label: Schema.String })
      ),
      maxSelections: Schema.Number
    }),
    Schema.TaggedStruct('MajorityJudgmentElection', {
      roleId: Schema.String,
      seatCount: Schema.Number,
      candidates: Schema.Array(
        Schema.Struct({
          id: MajorityJudgmentCandidateIdSchema,
          reference: Schema.String,
          displayName: Schema.String,
          description: Schema.String,
          links: Schema.Array(Schema.String),
          displayOrder: Schema.Number
        })
      )
    })
  ),
  {
    strict: true,
    decode: (value) =>
      value.variant === 'StandardProposal'
        ? {
            _tag: 'StandardProposal' as const,
            voteOptions: value.value.vote_options.map((option) => ({
              id: option.id[0],
              label: option.label
            })),
            maxSelections:
              value.value.max_selections.variant === 'Some'
                ? value.value.max_selections.value
                : 1
          }
        : {
            _tag: 'MajorityJudgmentElection' as const,
            roleId: value.value.role_id,
            seatCount: value.value.seat_count,
            candidates: value.value.candidates.map((candidate) => ({
              id: candidate.id[0],
              reference: candidate.reference,
              displayName: candidate.display_name,
              description: candidate.description,
              links: candidate.links,
              displayOrder: candidate.display_order
            }))
          },
    encode: (value) =>
      value._tag === 'StandardProposal'
        ? {
            variant: 'StandardProposal' as const,
            value: {
              vote_options: value.voteOptions.map((option) => ({
                id: numberTuple(option.id),
                label: option.label
              })),
              max_selections: encodeScryptoOptionalNumber(
                value.maxSelections === 1 ? undefined : value.maxSelections
              )
            }
          }
        : {
            variant: 'MajorityJudgmentElection' as const,
            value: {
              role_id: value.roleId,
              seat_count: value.seatCount,
              candidates: value.candidates.map((candidate) => ({
                id: candidateIdTuple(candidate.id),
                reference: candidate.reference,
                display_name: candidate.displayName,
                description: candidate.description,
                links: candidate.links,
                display_order: candidate.displayOrder
              }))
            }
          }
  }
)

const ContinuationEncodedSchema = Schema.Union(
  Schema.Struct({ variant: Schema.Literal('None') }),
  Schema.Struct({
    variant: Schema.Literal('Some'),
    value: Schema.Union(
      Schema.Struct({
        variant: Schema.Literal('Proposal'),
        value: Schema.Tuple(Schema.Number)
      }),
      Schema.Struct({
        variant: Schema.Literal('MajorityJudgmentElection'),
        value: Schema.Tuple(Schema.Number)
      })
    )
  })
)

export const ConsultationContinuationSchema = Schema.transform(
  ContinuationEncodedSchema,
  Schema.OptionFromSelf(
    Schema.Union(
      Schema.TaggedStruct('Proposal', { id: ProposalId }),
      Schema.TaggedStruct('MajorityJudgmentElection', {
        id: MajorityJudgmentElectionIdSchema
      })
    )
  ),
  {
    strict: true,
    decode: (value) =>
      value.variant === 'None'
        ? Option.none()
        : value.value.variant === 'Proposal'
          ? Option.some({
              _tag: 'Proposal' as const,
              id: ProposalId.make(value.value.value[0])
            })
          : Option.some({
              _tag: 'MajorityJudgmentElection' as const,
              id: MajorityJudgmentElectionIdSchema.make(value.value.value[0])
            }),
    encode: (value) =>
      Option.match(value, {
        onNone: () => ({ variant: 'None' as const }),
        onSome: (continuation) => ({
          variant: 'Some' as const,
          value:
            continuation._tag === 'Proposal'
              ? {
                  variant: 'Proposal' as const,
                  value: numberTuple(continuation.id)
                }
              : {
                  variant: 'MajorityJudgmentElection' as const,
                  value: numberTuple(continuation.id)
                }
        })
      })
  }
)

const TemperatureCheckOutcomeEncodedSchema = Schema.Union(
  Schema.Struct({
    variant: Schema.Literal('Passed'),
    value: Schema.Struct({ recorded_at: Schema.DateFromSelf })
  }),
  Schema.Struct({
    variant: Schema.Literal('Failed'),
    value: Schema.Struct({ recorded_at: Schema.DateFromSelf })
  })
)

export const TemperatureCheckOutcomeSchema = Schema.transform(
  Schema.Union(
    Schema.Struct({ variant: Schema.Literal('None') }),
    Schema.Struct({
      variant: Schema.Literal('Some'),
      value: TemperatureCheckOutcomeEncodedSchema
    })
  ),
  Schema.OptionFromSelf(
    Schema.Struct({
      passed: Schema.Boolean,
      recordedAt: Schema.DateFromSelf
    })
  ),
  {
    strict: true,
    decode: (value) =>
      value.variant === 'None'
        ? Option.none()
        : Option.some({
            passed: value.value.variant === 'Passed',
            recordedAt: value.value.value.recorded_at
          }),
    encode: (value) =>
      Option.match(value, {
        onNone: () => ({ variant: 'None' as const }),
        onSome: (outcome) => ({
          variant: 'Some' as const,
          value: {
            variant: outcome.passed ? ('Passed' as const) : ('Failed' as const),
            value: { recorded_at: outcome.recordedAt }
          }
        })
      })
  }
)

export const TemperatureCheckSchema = Schema.asSchema(
  Schema.transform(
    Schema.Struct({
      id: Schema.Number,
      title: Schema.String,
      short_description: Schema.String,
      description: Schema.String,
      links: Schema.Array(Schema.String),
      follow_up: TemperatureCheckFollowUpSchema,
      parameter_set: GovernanceParameterSetSnapshotSchema,
      voters: Schema.String,
      votes: Schema.String,
      vote_count: Schema.Number,
      revote_count: Schema.Number,
      snapshot: Schema.DateFromSelf,
      start: Schema.DateFromSelf,
      deadline: Schema.DateFromSelf,
      outcome: TemperatureCheckOutcomeSchema,
      continuation: ConsultationContinuationSchema,
      author: Schema.String,
      hidden: Schema.Boolean
    }),
    Schema.Struct({
      id: Schema.Number,
      title: Schema.String,
      shortDescription: Schema.String,
      description: Schema.String,
      links: Schema.Array(Schema.String),
      followUp: Schema.typeSchema(TemperatureCheckFollowUpSchema),
      parameterSet: Schema.typeSchema(GovernanceParameterSetSnapshotSchema),
      voters: KeyValueStoreAddress,
      votes: KeyValueStoreAddress,
      voteCount: Schema.Number,
      revoteCount: Schema.Number,
      snapshot: Schema.DateFromSelf,
      start: Schema.DateFromSelf,
      deadline: Schema.DateFromSelf,
      outcome: Schema.typeSchema(TemperatureCheckOutcomeSchema),
      continuation: Schema.typeSchema(ConsultationContinuationSchema),
      author: AccountAddress,
      hidden: Schema.Boolean
    }),
    {
      strict: true,
      decode: (value) => ({
        id: value.id,
        title: value.title,
        shortDescription: value.short_description,
        description: value.description,
        links: value.links,
        followUp: value.follow_up,
        parameterSet: value.parameter_set,
        voters: KeyValueStoreAddress.make(value.voters),
        votes: KeyValueStoreAddress.make(value.votes),
        voteCount: value.vote_count,
        revoteCount: value.revote_count,
        snapshot: value.snapshot,
        start: value.start,
        deadline: value.deadline,
        outcome: value.outcome,
        continuation: value.continuation,
        author: AccountAddress.make(value.author),
        hidden: value.hidden
      }),
      encode: (value) => ({
        id: value.id,
        title: value.title,
        short_description: value.shortDescription,
        description: value.description,
        links: value.links,
        follow_up: value.followUp,
        parameter_set: value.parameterSet,
        voters: value.voters,
        votes: value.votes,
        vote_count: value.voteCount,
        revote_count: value.revoteCount,
        snapshot: value.snapshot,
        start: value.start,
        deadline: value.deadline,
        outcome: value.outcome,
        continuation: value.continuation,
        author: value.author,
        hidden: value.hidden
      })
    }
  )
)
export type TemperatureCheck = typeof TemperatureCheckSchema.Type

const ProposalVoteOptionEncodedSchema = Schema.Struct({
  id: Schema.Tuple(Schema.Number),
  label: Schema.String
})

export const ProposalSchema = Schema.asSchema(
  Schema.transform(
    Schema.Struct({
      id: Schema.Number,
      title: Schema.String,
      short_description: Schema.String,
      description: Schema.String,
      voters: Schema.String,
      votes: Schema.String,
      vote_count: Schema.Number,
      revote_count: Schema.Number,
      vote_options: Schema.Array(ProposalVoteOptionEncodedSchema),
      links: Schema.Array(Schema.String),
      parameter_set: GovernanceParameterSetSnapshotSchema,
      max_selections: ScryptoOptionalNumberSchema,
      start: Schema.DateFromSelf,
      deadline: Schema.DateFromSelf,
      temperature_check_id: Schema.Number,
      author: Schema.String,
      hidden: Schema.Boolean
    }),
    Schema.Struct({
      id: Schema.Number,
      title: Schema.String,
      shortDescription: Schema.String,
      description: Schema.String,
      voters: KeyValueStoreAddress,
      votes: KeyValueStoreAddress,
      voteCount: Schema.Number,
      revoteCount: Schema.Number,
      voteOptions: Schema.Array(
        Schema.Struct({ id: Schema.Number, label: Schema.String })
      ),
      links: Schema.Array(Schema.String),
      parameterSet: Schema.typeSchema(GovernanceParameterSetSnapshotSchema),
      maxSelections: Schema.Number,
      start: Schema.DateFromSelf,
      deadline: Schema.DateFromSelf,
      temperatureCheckId: TemperatureCheckId,
      author: AccountAddress,
      hidden: Schema.Boolean
    }),
    {
      strict: true,
      decode: (value) => ({
        id: value.id,
        title: value.title,
        shortDescription: value.short_description,
        description: value.description,
        voters: KeyValueStoreAddress.make(value.voters),
        votes: KeyValueStoreAddress.make(value.votes),
        voteCount: value.vote_count,
        revoteCount: value.revote_count,
        voteOptions: value.vote_options.map((option) => ({
          id: option.id[0],
          label: option.label
        })),
        links: value.links,
        parameterSet: value.parameter_set,
        maxSelections:
          value.max_selections.variant === 'Some'
            ? value.max_selections.value
            : 1,
        start: value.start,
        deadline: value.deadline,
        temperatureCheckId: TemperatureCheckId.make(value.temperature_check_id),
        author: AccountAddress.make(value.author),
        hidden: value.hidden
      }),
      encode: (value) => ({
        id: value.id,
        title: value.title,
        short_description: value.shortDescription,
        description: value.description,
        voters: value.voters,
        votes: value.votes,
        vote_count: value.voteCount,
        revote_count: value.revoteCount,
        vote_options: value.voteOptions.map((option) => ({
          id: numberTuple(option.id),
          label: option.label
        })),
        links: value.links,
        parameter_set: value.parameterSet,
        max_selections: encodeScryptoOptionalNumber(
          value.maxSelections === 1 ? undefined : value.maxSelections
        ),
        start: value.start,
        deadline: value.deadline,
        temperature_check_id: value.temperatureCheckId,
        author: value.author,
        hidden: value.hidden
      })
    }
  )
)
export type Proposal = typeof ProposalSchema.Type

const CandidateGradeEncodedSchema = Schema.Struct({
  candidate_id: Schema.Tuple(MajorityJudgmentCandidateIdSchema),
  grade: ScryptoGradeToScoreSchema
})

const CandidateGradeDomainSchema = Schema.Struct({
  candidateId: MajorityJudgmentCandidateIdSchema,
  grade: GradeSchema
})

export const CandidateGradeSchema = Schema.transform(
  CandidateGradeEncodedSchema,
  CandidateGradeDomainSchema,
  {
    strict: true,
    decode: (value) => ({
      candidateId: value.candidate_id[0],
      grade: value.grade
    }),
    encode: (value) => ({
      candidate_id: candidateIdTuple(value.candidateId),
      grade: value.grade
    })
  }
)

const RoundEncodedSchema = Schema.Struct({
  snapshot: Schema.DateFromSelf,
  start: Schema.DateFromSelf,
  deadline: Schema.DateFromSelf,
  quorum: PositiveDecimalString,
  minimum_median_grade: ScryptoGradeToScoreSchema,
  voters: Schema.String,
  votes: Schema.String,
  vote_count: Schema.Number,
  revote_count: Schema.Number
})

export const MajorityJudgmentRoundSchema = Schema.transform(
  RoundEncodedSchema,
  Schema.Struct({
    snapshot: Schema.DateFromSelf,
    start: Schema.DateFromSelf,
    deadline: Schema.DateFromSelf,
    quorum: PositiveDecimalString,
    minimumMedianGrade: GradeSchema,
    voters: KeyValueStoreAddress,
    votes: KeyValueStoreAddress,
    voteCount: Schema.Number,
    revoteCount: Schema.Number
  }),
  {
    strict: true,
    decode: (value) => ({
      snapshot: value.snapshot,
      start: value.start,
      deadline: value.deadline,
      quorum: value.quorum,
      minimumMedianGrade: value.minimum_median_grade,
      voters: KeyValueStoreAddress.make(value.voters),
      votes: KeyValueStoreAddress.make(value.votes),
      voteCount: value.vote_count,
      revoteCount: value.revote_count
    }),
    encode: (value) => ({
      snapshot: value.snapshot,
      start: value.start,
      deadline: value.deadline,
      quorum: value.quorum,
      minimum_median_grade: value.minimumMedianGrade,
      voters: value.voters,
      votes: value.votes,
      vote_count: value.voteCount,
      revote_count: value.revoteCount
    })
  }
)

const ScryptoRoundIdSchema = Schema.Struct({
  variant: Schema.Literal('RoundOne', 'Rerun')
})

export const ScryptoRoundIdToDomainSchema = Schema.transform(
  ScryptoRoundIdSchema,
  MajorityJudgmentRoundIdSchema,
  {
    strict: true,
    decode: ({ variant }) => variant,
    encode: (round) => ({ variant: round })
  }
)

const ScryptoOptionalRoundSchema = Schema.Union(
  Schema.Struct({ variant: Schema.Literal('None') }),
  Schema.Struct({
    variant: Schema.Literal('Some'),
    value: MajorityJudgmentRoundSchema
  })
)

const ScryptoTieResolutionSchema = Schema.Struct({
  round: ScryptoRoundIdToDomainSchema,
  ordered_candidate_ids: Schema.Array(
    Schema.Tuple(MajorityJudgmentCandidateIdSchema)
  ),
  recorded_at: Schema.DateFromSelf
})

const ScryptoOptionalTieResolutionSchema = Schema.Union(
  Schema.Struct({ variant: Schema.Literal('None') }),
  Schema.Struct({
    variant: Schema.Literal('Some'),
    value: ScryptoTieResolutionSchema
  })
)

export const MajorityJudgmentElectionSchema = Schema.asSchema(
  Schema.transform(
    Schema.Struct({
      id: MajorityJudgmentElectionIdSchema,
      temperature_check_id: Schema.Number,
      round_one: MajorityJudgmentRoundSchema,
      rerun: ScryptoOptionalRoundSchema,
      tie_resolution: ScryptoOptionalTieResolutionSchema,
      hidden: Schema.Boolean
    }),
    Schema.Struct({
      id: MajorityJudgmentElectionIdSchema,
      temperatureCheckId: TemperatureCheckId,
      roundOne: Schema.typeSchema(MajorityJudgmentRoundSchema),
      rerun: Schema.OptionFromSelf(
        Schema.typeSchema(MajorityJudgmentRoundSchema)
      ),
      tieResolution: Schema.OptionFromSelf(
        Schema.Struct({
          round: MajorityJudgmentRoundIdSchema,
          orderedCandidateIds: Schema.Array(MajorityJudgmentCandidateIdSchema),
          recordedAt: Schema.DateFromSelf
        })
      ),
      hidden: Schema.Boolean
    }),
    {
      strict: true,
      decode: (value) => ({
        id: value.id,
        temperatureCheckId: TemperatureCheckId.make(value.temperature_check_id),
        roundOne: value.round_one,
        rerun:
          value.rerun.variant === 'Some'
            ? Option.some(value.rerun.value)
            : Option.none(),
        tieResolution:
          value.tie_resolution.variant === 'Some'
            ? Option.some({
                round: value.tie_resolution.value.round,
                orderedCandidateIds:
                  value.tie_resolution.value.ordered_candidate_ids.map(
                    ([candidateId]) => candidateId
                  ),
                recordedAt: value.tie_resolution.value.recorded_at
              })
            : Option.none(),
        hidden: value.hidden
      }),
      encode: (value) => ({
        id: MajorityJudgmentElectionIdSchema.make(value.id),
        temperature_check_id: value.temperatureCheckId,
        round_one: value.roundOne,
        rerun: Option.match(value.rerun, {
          onNone: () => ({ variant: 'None' as const }),
          onSome: (rerun) => ({ variant: 'Some' as const, value: rerun })
        }),
        tie_resolution: Option.match(value.tieResolution, {
          onNone: () => ({ variant: 'None' as const }),
          onSome: (tie) => ({
            variant: 'Some' as const,
            value: {
              round: tie.round,
              ordered_candidate_ids:
                tie.orderedCandidateIds.map(candidateIdTuple),
              recorded_at: tie.recordedAt
            }
          })
        }),
        hidden: value.hidden
      })
    }
  )
)
export type MajorityJudgmentElection =
  typeof MajorityJudgmentElectionSchema.Type

export const TemperatureCheckVoteSchema = Schema.transform(
  Schema.Struct({
    id: Schema.Number,
    voter: Schema.String,
    vote: Schema.Struct({
      variant: Schema.Literal('For', 'Against')
    })
  }),
  Schema.Struct({
    id: Schema.Number,
    voter: AccountAddress,
    vote: Schema.Literal('For', 'Against')
  }),
  {
    strict: true,
    decode: (value) => ({
      id: value.id,
      voter: AccountAddress.make(value.voter),
      vote: value.vote.variant
    }),
    encode: (value) => ({
      id: value.id,
      voter: value.voter,
      vote: { variant: value.vote }
    })
  }
)

export const MakeTemperatureCheckVoteInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  temperatureCheckId: TemperatureCheckId,
  vote: Schema.Literal('For', 'Against')
})
export type MakeTemperatureCheckVoteInput =
  typeof MakeTemperatureCheckVoteInputSchema.Encoded

export const MakeProposalVoteInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  proposalId: ProposalId,
  optionIds: Schema.Array(Schema.Number)
})
export type MakeProposalVoteInput = typeof MakeProposalVoteInputSchema.Encoded

const ProgrammaticScryptoSborValueSchema = Schema.declare(
  (input): input is ProgrammaticScryptoSborValue =>
    typeof input === 'object' && input !== null && 'kind' in input,
  { identifier: 'ProgrammaticScryptoSborValue' }
)

const unsupportedEncode = (value: unknown, ast: SchemaAST.AST) =>
  ParseResult.fail(new ParseResult.Type(ast, value, 'Encoding not supported'))

const decodeTemperatureCheckVote = (variant: string) =>
  variant === 'For' ? ('For' as const) : ('Against' as const)

export const TemperatureCheckVoteValueSchema = Schema.asSchema(
  Schema.transformOrFail(
    ProgrammaticScryptoSborValueSchema,
    Schema.Literal('For', 'Against'),
    {
      strict: true,
      decode: (value, _, ast) =>
        parseSbor(
          value,
          s.tuple([
            s.number(),
            s.enum([
              { variant: 'For', schema: s.tuple([]) },
              { variant: 'Against', schema: s.tuple([]) }
            ])
          ])
        ).pipe(
          Effect.map((result) => decodeTemperatureCheckVote(result[1].variant)),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, 'Invalid TC voter entry')
            )
          )
        ),
      encode: (value, _, ast) => unsupportedEncode(value, ast)
    }
  )
)

export const TemperatureCheckVoteRecord = Schema.asSchema(
  Schema.transformOrFail(
    ProgrammaticScryptoSborValueSchema,
    Schema.Struct({
      accountAddress: AccountAddress,
      vote: Schema.Literal('For', 'Against'),
      replacingVoteId: Schema.OptionFromSelf(Schema.Number)
    }),
    {
      strict: true,
      decode: (value, _, ast) =>
        parseSbor(
          value,
          s.tuple([
            s.address(),
            s.enum([
              { variant: 'For', schema: s.tuple([]) },
              { variant: 'Against', schema: s.tuple([]) }
            ]),
            s.option(s.number())
          ])
        ).pipe(
          Effect.map(([address, vote, replacingVoteId]) => ({
            accountAddress: AccountAddress.make(address),
            vote: decodeTemperatureCheckVote(vote.variant),
            replacingVoteId:
              replacingVoteId.variant === 'Some'
                ? Option.some(replacingVoteId.value)
                : Option.none<number>()
          })),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, 'Invalid TC vote record')
            )
          )
        ),
      encode: (value, _, ast) => unsupportedEncode(value, ast)
    }
  )
)

export const ProposalVoteValueSchema = Schema.asSchema(
  Schema.transformOrFail(
    ProgrammaticScryptoSborValueSchema,
    Schema.Array(Schema.Number),
    {
      strict: true,
      decode: (value, _, ast) =>
        parseSbor(
          value,
          s.tuple([s.number(), s.array(s.tuple([s.number()]))])
        ).pipe(
          Effect.map((result) => result[1].map((option) => option[0])),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, 'Invalid proposal voter entry')
            )
          )
        ),
      encode: (value, _, ast) => unsupportedEncode(value, ast)
    }
  )
)

export const ProposalVoteRecord = Schema.asSchema(
  Schema.transformOrFail(
    ProgrammaticScryptoSborValueSchema,
    Schema.Struct({
      accountAddress: AccountAddress,
      options: Schema.Array(Schema.Number),
      replacingVoteId: Schema.OptionFromSelf(Schema.Number)
    }),
    {
      strict: true,
      decode: (value, _, ast) =>
        parseSbor(
          value,
          s.tuple([
            s.address(),
            s.array(s.tuple([s.number()])),
            s.option(s.number())
          ])
        ).pipe(
          Effect.map(([address, options, replacingVoteId]) => ({
            accountAddress: AccountAddress.make(address),
            options: options.map((option) => option[0]),
            replacingVoteId:
              replacingVoteId.variant === 'Some'
                ? Option.some(replacingVoteId.value)
                : Option.none<number>()
          })),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, 'Invalid proposal vote record')
            )
          )
        ),
      encode: (value, _, ast) => unsupportedEncode(value, ast)
    }
  )
)

const decodeGradeName = (variant: string) => {
  switch (variant) {
    case 'Poor':
      return 0
    case 'Acceptable':
      return 1
    case 'Good':
      return 2
    case 'VeryGood':
      return 3
    case 'Excellent':
      return 4
    default:
      return -1
  }
}

export const MajorityJudgmentVoteValueSchema = Schema.asSchema(
  Schema.transformOrFail(
    ProgrammaticScryptoSborValueSchema,
    Schema.Struct({
      voteId: Schema.Number,
      grades: Schema.Array(CandidateGradeDomainSchema)
    }),
    {
      strict: true,
      decode: (value, _, ast) =>
        parseSbor(
          value,
          s.tuple([
            s.number(),
            s.array(s.tuple([s.tuple([s.number()]), SborGrade]))
          ])
        ).pipe(
          Effect.flatMap(([voteId, grades]) =>
            Effect.forEach(grades, ([candidateId, grade]) =>
              Schema.decodeUnknown(CandidateGradeDomainSchema)({
                candidateId: candidateId[0],
                grade: decodeGradeName(grade.variant)
              })
            ).pipe(
              Effect.map((decodedGrades) => ({
                voteId,
                grades: decodedGrades
              }))
            )
          ),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, 'Invalid MJ voter entry')
            )
          )
        ),
      encode: (value, _, ast) => unsupportedEncode(value, ast)
    }
  )
)

export const MajorityJudgmentVoteRecord = Schema.asSchema(
  Schema.transformOrFail(
    ProgrammaticScryptoSborValueSchema,
    Schema.Struct({
      accountAddress: AccountAddress,
      grades: Schema.Array(CandidateGradeDomainSchema),
      replacingVoteId: Schema.OptionFromSelf(Schema.Number)
    }),
    {
      strict: true,
      decode: (value, _, ast) =>
        parseSbor(
          value,
          s.tuple([
            s.address(),
            s.array(s.tuple([s.tuple([s.number()]), SborGrade])),
            s.option(s.number())
          ])
        ).pipe(
          Effect.flatMap(([address, grades, replacingVoteId]) =>
            Effect.forEach(grades, ([candidateId, grade]) =>
              Schema.decodeUnknown(CandidateGradeDomainSchema)({
                candidateId: candidateId[0],
                grade: decodeGradeName(grade.variant)
              })
            ).pipe(
              Effect.map((decodedGrades) => ({
                accountAddress: AccountAddress.make(address),
                grades: decodedGrades,
                replacingVoteId:
                  replacingVoteId.variant === 'Some'
                    ? Option.some(replacingVoteId.value)
                    : Option.none<number>()
              }))
            )
          ),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, 'Invalid MJ vote record')
            )
          )
        ),
      encode: (value, _, ast) => unsupportedEncode(value, ast)
    }
  )
)
