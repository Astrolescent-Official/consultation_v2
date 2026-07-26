import { AccountAddress } from '@radix-effects/shared'
import type { ProgrammaticScryptoSborValue } from '@radixdlt/babylon-gateway-api-sdk'
import BigNumber from 'bignumber.js'
import { Effect, Option, ParseResult, Schema } from 'effect'
import s from 'sbor-ez-mode'
import { parseSbor } from '../helpers/parseSbor'
import { KeyValueStoreAddress } from '../schemas'
import { ProposalId, TemperatureCheckId } from './brandedTypes'

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

const DurationDays = Schema.Number.pipe(Schema.int(), Schema.between(1, 65535))

const ScryptoOptionalNumberSchema = Schema.Union(
  Schema.Struct({
    variant: Schema.Literal('None'),
    value: Schema.Struct({})
  }),
  Schema.Struct({
    variant: Schema.Literal('Some'),
    value: Schema.Tuple(Schema.Number)
  })
)

type ScryptoOptionalNumber = typeof ScryptoOptionalNumberSchema.Type

const encodeScryptoOptionalNumber = (
  value: number | undefined
): ScryptoOptionalNumber =>
  value === undefined
    ? { variant: 'None', value: {} }
    : { variant: 'Some', value: [value] }

const numberTuple = (value: number): readonly [number] => [value]

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

export const GovernanceParametersSchema = Schema.transform(
  Schema.Struct({
    temperature_check_days: DurationDays,
    temperature_check_quorum: PositiveDecimalString,
    temperature_check_approval_threshold: ApprovalThresholdString,
    proposal_length_days: DurationDays,
    proposal_quorum: PositiveDecimalString,
    proposal_approval_threshold: ApprovalThresholdString
  }),
  Schema.Struct({
    temperatureCheckDays: DurationDays,
    temperatureCheckQuorum: PositiveDecimalString,
    temperatureCheckApprovalThreshold: ApprovalThresholdString,
    proposalLengthDays: DurationDays,
    proposalQuorum: PositiveDecimalString,
    proposalApprovalThreshold: ApprovalThresholdString
  }),
  {
    strict: true,
    decode: (value) => ({
      temperatureCheckDays: value.temperature_check_days,
      temperatureCheckQuorum: value.temperature_check_quorum,
      temperatureCheckApprovalThreshold:
        value.temperature_check_approval_threshold,
      proposalLengthDays: value.proposal_length_days,
      proposalQuorum: value.proposal_quorum,
      proposalApprovalThreshold: value.proposal_approval_threshold
    }),
    encode: (value) => ({
      temperature_check_days: value.temperatureCheckDays,
      temperature_check_quorum: value.temperatureCheckQuorum,
      temperature_check_approval_threshold:
        value.temperatureCheckApprovalThreshold,
      proposal_length_days: value.proposalLengthDays,
      proposal_quorum: value.proposalQuorum,
      proposal_approval_threshold: value.proposalApprovalThreshold
    })
  }
)

export type GovernanceParameters = typeof GovernanceParametersSchema.Type

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

export const GovernanceParameterSetInputSchema = Schema.Struct({
  label: GovernanceParameterSetLabelSchema,
  temperatureCheckDays: DurationDays,
  temperatureCheckQuorum: PositiveDecimalString,
  temperatureCheckApprovalThreshold: ApprovalThresholdString,
  proposalLengthDays: DurationDays,
  proposalQuorum: PositiveDecimalString,
  proposalApprovalThreshold: ApprovalThresholdString
})

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

export const partitionGovernanceParameterSets = (
  parameterSets: ReadonlyArray<GovernanceParameterSet>
) => ({
  active: parameterSets.filter((parameterSet) => !parameterSet.retired),
  retired: parameterSets.filter((parameterSet) => parameterSet.retired)
})

export const MakeTemperatureCheckInputSchema = Schema.Struct({
  title: Schema.String,
  shortDescription: Schema.String,
  description: Schema.String,
  voteOptions: Schema.Array(Schema.String),
  links: Schema.Array(Schema.String),
  maxSelections: Schema.Union(
    Schema.Literal(1),
    Schema.Number.pipe(Schema.greaterThan(1))
  ),
  authorAccount: AccountAddress,
  parameterSetId: GovernanceParameterSetIdSchema
})

export type MakeTemperatureCheckInput =
  typeof MakeTemperatureCheckInputSchema.Encoded

export const TemperatureCheckSchema = Schema.asSchema(
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
      vote_options: Schema.Array(
        Schema.Struct({
          id: Schema.Tuple(Schema.Number),
          label: Schema.String
        })
      ),
      links: Schema.Array(Schema.String),
      parameter_set: GovernanceParameterSetSnapshotSchema,
      max_selections: ScryptoOptionalNumberSchema,
      start: Schema.Number,
      deadline: Schema.Number,
      elevated_proposal_id: ScryptoOptionalNumberSchema,
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
        Schema.Struct({
          id: Schema.Number,
          label: Schema.String
        })
      ),
      links: Schema.Array(Schema.String),
      parameterSet: Schema.typeSchema(GovernanceParameterSetSnapshotSchema),
      maxSelections: Schema.Number,
      start: Schema.DateFromSelf,
      deadline: Schema.DateFromSelf,
      elevatedProposalId: Schema.OptionFromSelf(ProposalId),
      author: AccountAddress,
      hidden: Schema.Boolean
    }),
    {
      decode: (fromA) => ({
        id: fromA.id,
        title: fromA.title,
        shortDescription: fromA.short_description,
        description: fromA.description,
        voters: KeyValueStoreAddress.make(fromA.voters),
        votes: KeyValueStoreAddress.make(fromA.votes),
        voteCount: fromA.vote_count,
        revoteCount: fromA.revote_count,
        voteOptions: fromA.vote_options.map((option) => ({
          id: option.id[0],
          label: option.label
        })),
        links: fromA.links,
        parameterSet: fromA.parameter_set,
        maxSelections:
          fromA.max_selections.variant === 'Some'
            ? fromA.max_selections.value[0]
            : 1,
        start: new Date(fromA.start * 1000),
        deadline: new Date(fromA.deadline * 1000),
        elevatedProposalId:
          fromA.elevated_proposal_id.variant === 'Some'
            ? Option.some(ProposalId.make(fromA.elevated_proposal_id.value[0]))
            : Option.none(),
        author: AccountAddress.make(fromA.author),
        hidden: fromA.hidden
      }),
      encode: (values) => ({
        id: values.id,
        title: values.title,
        short_description: values.shortDescription,
        description: values.description,
        voters: values.voters,
        votes: values.votes,
        vote_count: values.voteCount,
        revote_count: values.revoteCount,
        vote_options: values.voteOptions.map((option) => ({
          id: numberTuple(option.id),
          label: option.label
        })),
        links: values.links.map((url) => url.toString()),
        parameter_set: values.parameterSet,
        max_selections: encodeScryptoOptionalNumber(
          values.maxSelections === 1 ? undefined : values.maxSelections
        ),
        start: Math.floor(values.start.getTime() / 1000),
        deadline: Math.floor(values.deadline.getTime() / 1000),
        elevated_proposal_id: Option.match(values.elevatedProposalId, {
          onNone: () => encodeScryptoOptionalNumber(undefined),
          onSome: encodeScryptoOptionalNumber
        }),
        author: values.author,
        hidden: values.hidden
      }),
      strict: true
    }
  )
)

export type TemperatureCheck = typeof TemperatureCheckSchema.Type

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
      vote_options: Schema.Array(
        Schema.Struct({
          id: Schema.Tuple(Schema.Number),
          label: Schema.String
        })
      ),
      links: Schema.Array(Schema.String),
      parameter_set: GovernanceParameterSetSnapshotSchema,
      max_selections: ScryptoOptionalNumberSchema,
      start: Schema.Number,
      deadline: Schema.Number,
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
        Schema.Struct({
          id: Schema.Number,
          label: Schema.String
        })
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
      decode: (fromA) => ({
        id: fromA.id,
        title: fromA.title,
        shortDescription: fromA.short_description,
        description: fromA.description,
        voters: KeyValueStoreAddress.make(fromA.voters),
        votes: KeyValueStoreAddress.make(fromA.votes),
        voteCount: fromA.vote_count,
        revoteCount: fromA.revote_count,
        voteOptions: fromA.vote_options.map((option) => ({
          id: option.id[0],
          label: option.label
        })),
        links: fromA.links,
        parameterSet: fromA.parameter_set,
        maxSelections:
          fromA.max_selections.variant === 'Some'
            ? fromA.max_selections.value[0]
            : 1,
        start: new Date(fromA.start * 1000),
        deadline: new Date(fromA.deadline * 1000),
        temperatureCheckId: TemperatureCheckId.make(fromA.temperature_check_id),
        author: AccountAddress.make(fromA.author),
        hidden: fromA.hidden
      }),
      encode: (values) => ({
        id: values.id,
        title: values.title,
        short_description: values.shortDescription,
        description: values.description,
        voters: values.voters,
        votes: values.votes,
        vote_count: values.voteCount,
        revote_count: values.revoteCount,
        vote_options: values.voteOptions.map((option) => ({
          id: numberTuple(option.id),
          label: option.label
        })),
        links: values.links,
        parameter_set: values.parameterSet,
        max_selections: encodeScryptoOptionalNumber(
          values.maxSelections === 1 ? undefined : values.maxSelections
        ),
        start: Math.floor(values.start.getTime() / 1000),
        deadline: Math.floor(values.deadline.getTime() / 1000),
        temperature_check_id: values.temperatureCheckId,
        author: values.author,
        hidden: values.hidden
      }),
      strict: true
    }
  )
)

export type Proposal = typeof ProposalSchema.Type

export const TemperatureCheckVoteSchema = Schema.transform(
  Schema.Struct({
    id: Schema.Number,
    voter: Schema.String,
    vote: Schema.Struct({
      variant: Schema.String,
      value: Schema.Tuple()
    })
  }),
  Schema.Struct({
    id: Schema.Number,
    voter: AccountAddress,
    vote: Schema.Literal('For', 'Against')
  }),
  {
    strict: true,
    decode: (fromA) => ({
      id: fromA.id,
      voter: AccountAddress.make(fromA.voter),
      vote: fromA.vote.variant as 'For' | 'Against'
    }),
    encode: (values) => ({
      id: values.id,
      voter: values.voter,
      vote: { variant: values.vote, value: [] as const }
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
  {
    identifier: 'ProgrammaticScryptoSborValue'
  }
)

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
              { variant: 'For', schema: s.structNullable({}) },
              { variant: 'Against', schema: s.structNullable({}) }
            ])
          ])
        ).pipe(
          Effect.map((result) => result[1].variant),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, `Invalid vote value: ${value}`)
            )
          )
        ),
      encode: (_, __, ast) =>
        ParseResult.fail(new ParseResult.Type(ast, _, 'Encoding not supported'))
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
              { variant: 'For', schema: s.structNullable({}) },
              { variant: 'Against', schema: s.structNullable({}) }
            ]),
            s.enum([
              { variant: 'None', schema: s.structNullable({}) },
              { variant: 'Some', schema: s.tuple([s.number()]) }
            ])
          ])
        ).pipe(
          Effect.map(([address, vote, replacingVoteId]) => ({
            accountAddress: AccountAddress.make(address),
            vote: vote.variant as 'For' | 'Against',
            replacingVoteId:
              replacingVoteId.variant === 'Some'
                ? Option.some(replacingVoteId.value[0])
                : Option.none<number>()
          })),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(ast, value, `Invalid vote value: ${value}`)
            )
          )
        ),
      encode: (_, __, ast) =>
        ParseResult.fail(new ParseResult.Type(ast, _, 'Encoding not supported'))
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
              new ParseResult.Type(
                ast,
                value,
                `Invalid proposal vote value: ${value}`
              )
            )
          )
        ),
      encode: (_, __, ast) =>
        ParseResult.fail(new ParseResult.Type(ast, _, 'Encoding not supported'))
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
            s.enum([
              { variant: 'None', schema: s.structNullable({}) },
              { variant: 'Some', schema: s.tuple([s.number()]) }
            ])
          ])
        ).pipe(
          Effect.map(([address, options, replacingVoteId]) => ({
            accountAddress: AccountAddress.make(address),
            options: options.map((option) => option[0]),
            replacingVoteId:
              replacingVoteId.variant === 'Some'
                ? Option.some(replacingVoteId.value[0])
                : Option.none<number>()
          })),
          Effect.catchAll(() =>
            ParseResult.fail(
              new ParseResult.Type(
                ast,
                value,
                `Invalid proposal vote value: ${value}`
              )
            )
          )
        ),
      encode: (_, __, ast) =>
        ParseResult.fail(new ParseResult.Type(ast, _, 'Encoding not supported'))
    }
  )
)
