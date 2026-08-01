import { AccountAddress } from '@radix-effects/shared'
import BigNumber from 'bignumber.js'
import { Schema } from 'effect'

export const DecimalStringSchema = Schema.String.pipe(
  Schema.filter(
    (value) => {
      const decimal = new BigNumber(value)
      return decimal.isFinite() && decimal.isGreaterThanOrEqualTo(0)
    },
    { message: () => 'Must be a non-negative decimal string' }
  )
)

export const PositiveDecimalStringSchema = DecimalStringSchema.pipe(
  Schema.filter((value) => new BigNumber(value).isGreaterThan(0), {
    message: () => 'Must be greater than zero'
  })
)

export const calculateTemperatureCheckOutcome = (input: {
  readonly results: ReadonlyArray<{
    readonly vote: string
    readonly votePower: string
  }>
  readonly quorumXrd: string
  readonly approvalThreshold: string
}) => {
  const forVotingPower = new BigNumber(
    input.results.find(({ vote }) => vote === 'For')?.votePower ?? '0'
  )
  const againstVotingPower = new BigNumber(
    input.results.find(({ vote }) => vote === 'Against')?.votePower ?? '0'
  )
  const participation = forVotingPower.plus(againstVotingPower)
  const forShare = participation.isZero()
    ? new BigNumber(0)
    : forVotingPower.dividedBy(participation)
  const quorumMet = participation.isGreaterThanOrEqualTo(input.quorumXrd)
  const approvalMet = forShare.isGreaterThanOrEqualTo(input.approvalThreshold)

  return {
    forVotingPower: forVotingPower.toFixed(),
    againstVotingPower: againstVotingPower.toFixed(),
    participationXrd: participation.toFixed(),
    quorumXrd: input.quorumXrd,
    quorumMet,
    approvalThreshold: input.approvalThreshold,
    forShare: forShare.toFixed(),
    approvalMet,
    calculatedPassed: quorumMet && approvalMet
  }
}

export const CandidateHttpUrlStringSchema = Schema.String.pipe(
  Schema.filter(
    (value) => {
      const bytes = new TextEncoder().encode(value)
      if (
        bytes.length === 0 ||
        bytes.length > 1_024 ||
        !bytes.every((byte) => byte >= 0x21 && byte <= 0x7e && byte !== 0x5c)
      ) {
        return false
      }

      try {
        const parsed = new URL(value)
        const hostLabels = parsed.hostname.split('.')
        return (
          (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
          parsed.username === '' &&
          parsed.password === '' &&
          !parsed.hostname.includes(':') &&
          hostLabels.every(
            (label) =>
              label.length > 0 &&
              !label.startsWith('-') &&
              !label.endsWith('-') &&
              [...label].every((character) => /[a-zA-Z0-9-]/.test(character))
          ) &&
          (parsed.port === '' || Number(parsed.port) > 0)
        )
      } catch {
        return false
      }
    },
    {
      message: () => 'Must be a valid HTTP(S) URL of at most 1,024 ASCII bytes'
    }
  )
)

export const GradeSchema = Schema.Literal(0, 1, 2, 3, 4)
export type Grade = typeof GradeSchema.Type

export const GradeNameSchema = Schema.Literal(
  'Poor',
  'Acceptable',
  'Good',
  'Very Good',
  'Excellent'
)
export type GradeName = typeof GradeNameSchema.Type

export const gradeName = (grade: Grade): GradeName => {
  switch (grade) {
    case 0:
      return 'Poor'
    case 1:
      return 'Acceptable'
    case 2:
      return 'Good'
    case 3:
      return 'Very Good'
    case 4:
      return 'Excellent'
  }
}

export const MajorityJudgmentElectionIdSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.brand('MajorityJudgmentElectionId')
)
export type MajorityJudgmentElectionId =
  typeof MajorityJudgmentElectionIdSchema.Type

export const MajorityJudgmentCandidateIdSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.brand('MajorityJudgmentCandidateId')
)
export type MajorityJudgmentCandidateId =
  typeof MajorityJudgmentCandidateIdSchema.Type

export const MajorityJudgmentRoundIdSchema = Schema.Literal('RoundOne', 'Rerun')
export type MajorityJudgmentRoundId = typeof MajorityJudgmentRoundIdSchema.Type

export const MajorityJudgmentElectionStatusSchema = Schema.Literal(
  'PENDING',
  'TC_LIVE',
  'TC_FAILED',
  'MJ_PENDING',
  'LIVE',
  'ROUND_1_FAILED',
  'RERUN_PENDING',
  'RERUN_LIVE',
  'FINAL',
  'TIE_UNRESOLVED',
  'FAILED'
)
export type MajorityJudgmentElectionStatus =
  typeof MajorityJudgmentElectionStatusSchema.Type

export const canTransitionFromRoundOneFailure = (
  nextStatus: MajorityJudgmentElectionStatus
) => nextStatus === 'RERUN_PENDING' || nextStatus === 'RERUN_LIVE'

export const canStartMajorityJudgmentRerun = (
  status: MajorityJudgmentElectionStatus
) => status === 'ROUND_1_FAILED'

export const MajorityJudgmentCandidateOutcomeSchema = Schema.Literal(
  'SEATED',
  'RESERVE',
  'NOT_ELECTABLE',
  'UNRESOLVED'
)

const CandidateGradeSchema = Schema.Struct({
  candidateId: MajorityJudgmentCandidateIdSchema,
  grade: GradeSchema
})

export class MajorityJudgmentCandidateInput extends Schema.Class<MajorityJudgmentCandidateInput>(
  'MajorityJudgmentCandidateInput'
)({
  reference: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  displayName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  description: Schema.String.pipe(Schema.minLength(1)),
  links: Schema.Array(CandidateHttpUrlStringSchema).pipe(Schema.maxItems(5))
}) {}

const CandidateIdsSchema = Schema.Array(MajorityJudgmentCandidateIdSchema).pipe(
  Schema.minItems(1),
  Schema.maxItems(20),
  Schema.filter(
    (candidateIds) =>
      new Set(candidateIds.map((candidateId) => Number(candidateId))).size ===
      candidateIds.length,
    { message: () => 'Candidate ids must be unique' }
  )
)

const RawMakeMajorityJudgmentVoteInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  electionId: MajorityJudgmentElectionIdSchema,
  round: MajorityJudgmentRoundIdSchema,
  candidateIds: CandidateIdsSchema,
  grades: Schema.Array(CandidateGradeSchema).pipe(
    Schema.minItems(1),
    Schema.maxItems(20)
  )
}).pipe(
  Schema.filter(
    ({ candidateIds, grades }) => {
      const expected = [...candidateIds].map(Number).sort((a, b) => a - b)
      const actual = grades
        .map(({ candidateId }) => Number(candidateId))
        .sort((a, b) => a - b)
      return (
        actual.length === expected.length &&
        actual.every((candidateId, index) => candidateId === expected[index])
      )
    },
    {
      message: () => 'Ballot must contain exactly one grade for every candidate'
    }
  )
)

export const MakeMajorityJudgmentVoteInputSchema = Schema.transform(
  RawMakeMajorityJudgmentVoteInputSchema,
  RawMakeMajorityJudgmentVoteInputSchema,
  {
    strict: true,
    decode: (input) => ({
      ...input,
      candidateIds: [...input.candidateIds].sort(
        (left, right) => Number(left) - Number(right)
      ),
      grades: [...input.grades].sort(
        (left, right) => Number(left.candidateId) - Number(right.candidateId)
      )
    }),
    encode: (input) => ({
      ...input,
      accountAddress: AccountAddress.make(input.accountAddress),
      electionId: MajorityJudgmentElectionIdSchema.make(input.electionId),
      candidateIds: input.candidateIds.map((candidateId) =>
        MajorityJudgmentCandidateIdSchema.make(candidateId)
      ),
      grades: input.grades.map((candidateGrade) => ({
        ...candidateGrade,
        candidateId: MajorityJudgmentCandidateIdSchema.make(
          candidateGrade.candidateId
        )
      }))
    })
  }
)
export type MakeMajorityJudgmentVoteInput =
  typeof MakeMajorityJudgmentVoteInputSchema.Type

const CandidateOrderSchema = Schema.Array(
  MajorityJudgmentCandidateIdSchema
).pipe(
  Schema.minItems(1),
  Schema.maxItems(20),
  Schema.filter(
    (candidateIds) =>
      new Set(candidateIds.map(Number)).size === candidateIds.length,
    { message: () => 'Candidate ids must be unique' }
  )
)

export const MakeMajorityJudgmentElectionInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  title: Schema.String.pipe(Schema.minLength(1)),
  shortDescription: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.String.pipe(Schema.minLength(1)),
  links: Schema.Array(Schema.String).pipe(Schema.maxItems(10)),
  roleId: Schema.String.pipe(Schema.minLength(1)),
  seatCount: Schema.Number.pipe(Schema.int(), Schema.positive()),
  candidates: Schema.Array(MajorityJudgmentCandidateInput).pipe(
    Schema.minItems(1),
    Schema.maxItems(20)
  ),
  parameterSetId: Schema.String.pipe(Schema.minLength(1)),
  tcVotingStart: Schema.DateFromSelf,
  tcVotingEnd: Schema.DateFromSelf,
  votingStart: Schema.DateFromSelf,
  votingEnd: Schema.DateFromSelf,
  candidateOrder: CandidateOrderSchema
}).pipe(
  Schema.filter(
    ({ candidates, candidateOrder }) => {
      const actual = [...candidateOrder].map(Number).sort((a, b) => a - b)
      return (
        actual.length === candidates.length &&
        actual.every((candidateId, index) => candidateId === index)
      )
    },
    { message: () => 'Candidate order must be a complete permutation' }
  ),
  Schema.filter(
    ({ tcVotingStart, tcVotingEnd, votingStart, votingEnd }) =>
      tcVotingStart < tcVotingEnd &&
      tcVotingEnd <= votingStart &&
      votingStart < votingEnd,
    { message: () => 'Election voting timestamps must be ordered' }
  )
)
export type MakeMajorityJudgmentElectionInput =
  typeof MakeMajorityJudgmentElectionInputSchema.Type

export const StartMajorityJudgmentRerunInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  electionId: MajorityJudgmentElectionIdSchema,
  votingStart: Schema.DateFromSelf
})
export type StartMajorityJudgmentRerunInput =
  typeof StartMajorityJudgmentRerunInputSchema.Encoded

export const MakeMajorityJudgmentTieResolutionInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  electionId: MajorityJudgmentElectionIdSchema,
  round: MajorityJudgmentRoundIdSchema,
  orderedCandidateIds: CandidateOrderSchema
})
export type MakeMajorityJudgmentTieResolutionInput =
  typeof MakeMajorityJudgmentTieResolutionInputSchema.Encoded

export const ToggleMajorityJudgmentElectionHiddenInputSchema = Schema.Struct({
  accountAddress: AccountAddress,
  electionId: MajorityJudgmentElectionIdSchema
})
export type ToggleMajorityJudgmentElectionHiddenInput =
  typeof ToggleMajorityJudgmentElectionHiddenInputSchema.Encoded

export class MajorityJudgmentElectionProjection extends Schema.Class<MajorityJudgmentElectionProjection>(
  'MajorityJudgmentElectionProjection'
)({
  id: MajorityJudgmentElectionIdSchema,
  temperatureCheckId: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  roleId: Schema.String.pipe(Schema.minLength(1)),
  title: Schema.String,
  shortDescription: Schema.String,
  description: Schema.String,
  seatCount: Schema.Number.pipe(Schema.int(), Schema.positive()),
  snapshotAt: Schema.Date,
  tcVotingStart: Schema.Date,
  tcVotingEnd: Schema.Date,
  tcQuorumXrd: PositiveDecimalStringSchema,
  tcApprovalThreshold: PositiveDecimalStringSchema,
  tcOutcome: Schema.Literal('PENDING', 'PASSED', 'FAILED'),
  tcOutcomeRecordedAt: Schema.NullOr(Schema.Date),
  parameterSetId: Schema.String.pipe(Schema.minLength(1)),
  parameterSetVersion: Schema.Number.pipe(Schema.int(), Schema.positive()),
  reserveListDays: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  status: MajorityJudgmentElectionStatusSchema,
  hidden: Schema.Boolean
}) {}

export class MajorityJudgmentCandidateProjection extends Schema.Class<MajorityJudgmentCandidateProjection>(
  'MajorityJudgmentCandidateProjection'
)({
  id: MajorityJudgmentCandidateIdSchema,
  reference: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  links: Schema.Array(CandidateHttpUrlStringSchema).pipe(Schema.maxItems(5)),
  displayOrder: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {}

export class MajorityJudgmentRoundProjection extends Schema.Class<MajorityJudgmentRoundProjection>(
  'MajorityJudgmentRoundProjection'
)({
  round: MajorityJudgmentRoundIdSchema,
  snapshotAt: Schema.Date,
  votingStart: Schema.Date,
  votingEnd: Schema.Date,
  quorumXrd: PositiveDecimalStringSchema,
  minimumMedianGrade: GradeSchema
}) {}

export class MajorityJudgmentCandidateResult extends Schema.Class<MajorityJudgmentCandidateResult>(
  'MajorityJudgmentCandidateResult'
)({
  candidateId: MajorityJudgmentCandidateIdSchema,
  histogram: Schema.Tuple(
    DecimalStringSchema,
    DecimalStringSchema,
    DecimalStringSchema,
    DecimalStringSchema,
    DecimalStringSchema
  ),
  majorityGrade: Schema.NullOr(GradeSchema),
  finalMajorityGrade: Schema.NullOr(GradeSchema),
  electable: Schema.Boolean,
  rank: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.positive())),
  outcome: MajorityJudgmentCandidateOutcomeSchema
}) {}

export class MajorityJudgmentResultResponse extends Schema.Class<MajorityJudgmentResultResponse>(
  'MajorityJudgmentResultResponse'
)({
  status: MajorityJudgmentElectionStatusSchema,
  round: MajorityJudgmentRoundIdSchema,
  provisional: Schema.Boolean,
  totalVotingPower: DecimalStringSchema,
  quorumXrd: PositiveDecimalStringSchema,
  quorumMet: Schema.Boolean,
  minimumMedianGrade: GradeSchema,
  candidateResults: Schema.Array(MajorityJudgmentCandidateResult),
  seatedCandidateIds: Schema.Array(MajorityJudgmentCandidateIdSchema),
  reserveCandidateIds: Schema.Array(MajorityJudgmentCandidateIdSchema),
  reserveExpiresAt: Schema.NullOr(Schema.Date),
  referredSeats: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  tieBreakIterations: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  unresolvedCandidateIds: Schema.Array(MajorityJudgmentCandidateIdSchema)
}) {}

export class TemperatureCheckResultResponse extends Schema.Class<TemperatureCheckResultResponse>(
  'TemperatureCheckResultResponse'
)({
  tcParametersProjected: Schema.Boolean,
  cacheAvailable: Schema.Boolean,
  forVotingPower: DecimalStringSchema,
  againstVotingPower: DecimalStringSchema,
  participationXrd: DecimalStringSchema,
  quorumXrd: PositiveDecimalStringSchema,
  quorumMet: Schema.Boolean,
  approvalThreshold: PositiveDecimalStringSchema,
  forShare: DecimalStringSchema,
  approvalMet: Schema.Boolean,
  calculatedPassed: Schema.Boolean,
  recordedPassed: Schema.NullOr(Schema.Boolean),
  outcomeConsistent: Schema.NullOr(Schema.Boolean),
  passed: Schema.NullOr(Schema.Boolean),
  recordedAt: Schema.NullOr(Schema.Date)
}) {}

export class MajorityJudgmentElectionResponse extends Schema.Class<MajorityJudgmentElectionResponse>(
  'MajorityJudgmentElectionResponse'
)({
  election: MajorityJudgmentElectionProjection,
  candidates: Schema.Array(MajorityJudgmentCandidateProjection),
  currentRound: MajorityJudgmentRoundProjection,
  rounds: Schema.Array(MajorityJudgmentRoundProjection),
  temperatureCheckResult: TemperatureCheckResultResponse,
  result: Schema.optional(MajorityJudgmentResultResponse),
  results: Schema.Array(MajorityJudgmentResultResponse)
}) {}

export const MajorityJudgmentElectionResponseSchema =
  MajorityJudgmentElectionResponse
