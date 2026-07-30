import { ParseResult, Schema } from 'effect'
import { CandidateHttpUrlStringSchema } from 'shared/governance/index'
import { GovernanceParameterSetIdSchema } from 'shared/governance/schemas'
import {
  formatGovernanceDuration,
  msPerGovernanceDurationUnit
} from '@/lib/governanceDuration'

export function effectSchemaValidator<T, I>(schema: Schema.Schema<T, I>) {
  return ({ value }: { value: unknown }) => {
    const result = Schema.decodeUnknownEither(schema)(value)
    if (result._tag === 'Left') {
      const errors = ParseResult.ArrayFormatter.formatErrorSync(result.left)
      return errors
    }
    return undefined
  }
}

export const TitleSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => 'Title is required' }),
  Schema.maxLength(200, {
    message: () => 'Title must be 200 characters or less'
  })
)

export const ShortDescriptionSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => 'Short description is required' }),
  Schema.maxLength(500, {
    message: () => 'Short description must be 500 characters or less'
  })
)

export const DescriptionSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => 'Description is required' })
)

export const RadixTalkUrlSchema = Schema.URL.pipe(
  Schema.filter((url) => url.origin === 'https://radixtalk.com', {
    message: () => 'URL must start with https://radixtalk.com/'
  })
)

export const LinkSchema = Schema.String.pipe(
  Schema.filter(
    (value) => {
      if (!value) return true // Empty is ok for optional additional links
      try {
        new URL(value)
        return true
      } catch {
        return false
      }
    },
    { message: () => 'Must be a valid URL' }
  )
)

const VoteOptionSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Option label is required' })
  )
})

const CandidateLinkSchema = Schema.Union(
  Schema.Literal(''),
  CandidateHttpUrlStringSchema
)

const CandidateFormSchema = Schema.Struct({
  id: Schema.String,
  reference: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Candidate reference is required' })
  ),
  displayName: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Candidate name is required' })
  ),
  description: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Candidate profile is required' })
  ),
  links: Schema.Array(CandidateLinkSchema).pipe(Schema.maxItems(5))
})

// The form carries both follow-up drafts at once, but only the selected profile's
// editor is rendered. The unselected draft keeps its blank seeded rows, so it must
// stay unconstrained or it would block submission with errors the user cannot fix.
const UnusedVoteOptionSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String
})

const UnusedCandidateSchema = Schema.Struct({
  id: Schema.String,
  reference: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  links: Schema.Array(Schema.String)
})

const sharedFields = {
  parameterSetId: GovernanceParameterSetIdSchema,
  title: TitleSchema,
  shortDescription: ShortDescriptionSchema,
  description: DescriptionSchema,
  radixTalkUrl: RadixTalkUrlSchema,
  links: Schema.Array(LinkSchema),
  maxSelections: Schema.Union(
    Schema.Literal(1),
    Schema.Number.pipe(Schema.greaterThan(1))
  ),
  includeAbstain: Schema.Boolean,
  seatCount: Schema.Number.pipe(Schema.int(), Schema.positive()),
  tcVotingStart: Schema.String,
  tcVotingEnd: Schema.String,
  votingStart: Schema.String,
  votingEnd: Schema.String
}

const StandardTemperatureCheckFormSchema = Schema.Struct({
  ...sharedFields,
  processType: Schema.Literal('Standard'),
  voteOptions: Schema.Array(VoteOptionSchema).pipe(
    Schema.minItems(2, { message: () => 'At least 2 options required' }),
    Schema.maxItems(10, { message: () => 'At most 10 options allowed' })
  ),
  roleId: Schema.String,
  candidates: Schema.Array(UnusedCandidateSchema)
}).pipe(
  Schema.filter(
    ({ voteOptions, maxSelections, includeAbstain }) =>
      voteOptions.length + (maxSelections === 1 && includeAbstain ? 1 : 0) <=
      10,
    {
      message: () =>
        'Single-choice proposals can have at most 9 custom options plus Abstain'
    }
  )
)

// The on-chain contract rejects a TC/election window shorter than the selected
// governance parameter set's own `voting_days` (interpreted in minutes on
// stokenet, days elsewhere) — so the client minimum must be derived from the
// same parameter set rather than a fixed constant, or a form-valid schedule
// could still be rejected on submission, or a legitimate short schedule
// blocked client-side.

// A parameter set always enforces voting_days > 0 on-chain, so one unit is the
// least permissive floor to apply before a concrete parameter set is known.
const DEFAULT_MIN_VOTING_UNITS = 1

export const makeMajorityJudgmentTemperatureCheckFormSchema = (
  minimums: {
    temperatureCheckVotingUnits: number
    electionVotingUnits: number
  } = {
    temperatureCheckVotingUnits: DEFAULT_MIN_VOTING_UNITS,
    electionVotingUnits: DEFAULT_MIN_VOTING_UNITS
  }
) => {
  const minTcDurationMs =
    minimums.temperatureCheckVotingUnits * msPerGovernanceDurationUnit
  const minElectionDurationMs =
    minimums.electionVotingUnits * msPerGovernanceDurationUnit

  return Schema.Struct({
    ...sharedFields,
    processType: Schema.Literal('MajorityJudgment'),
    voteOptions: Schema.Array(UnusedVoteOptionSchema),
    roleId: Schema.String.pipe(
      Schema.filter((value) => value.trim().length > 0, {
        message: () => 'Role identifier is required'
      })
    ),
    candidates: Schema.Array(CandidateFormSchema).pipe(
      Schema.minItems(1, { message: () => 'At least 1 candidate required' }),
      Schema.maxItems(20, { message: () => 'At most 20 candidates allowed' }),
      Schema.filter(
        (candidates) =>
          new Set(candidates.map(({ reference }) => reference)).size ===
          candidates.length,
        { message: () => 'Candidate references must be unique' }
      )
    )
  }).pipe(
    Schema.filter(
      ({ tcVotingStart, tcVotingEnd, votingStart, votingEnd }) => {
        const tcStart = new Date(tcVotingStart).getTime()
        const tcEnd = new Date(tcVotingEnd).getTime()
        const mjStart = new Date(votingStart).getTime()
        const mjEnd = new Date(votingEnd).getTime()
        return (
          Number.isFinite(tcStart) &&
          tcStart > Date.now() &&
          tcEnd - tcStart >= minTcDurationMs &&
          mjStart >= tcEnd &&
          mjEnd - mjStart >= minElectionDurationMs
        )
      },
      {
        message: () =>
          `TC must start in the future and last at least ${formatGovernanceDuration(minimums.temperatureCheckVotingUnits)}; ` +
          `MJ voting must start after it closes and last at least ${formatGovernanceDuration(minimums.electionVotingUnits)}`
      }
    )
  )
}

const MajorityJudgmentTemperatureCheckFormSchema =
  makeMajorityJudgmentTemperatureCheckFormSchema()

export const makeTemperatureCheckFormSchema = (minimums?: {
  temperatureCheckVotingUnits: number
  electionVotingUnits: number
}) =>
  Schema.Union(
    StandardTemperatureCheckFormSchema,
    makeMajorityJudgmentTemperatureCheckFormSchema(minimums)
  )

export const TemperatureCheckFormSchema = Schema.Union(
  StandardTemperatureCheckFormSchema,
  MajorityJudgmentTemperatureCheckFormSchema
)

export type TemperatureCheckFormData = typeof TemperatureCheckFormSchema.Type
