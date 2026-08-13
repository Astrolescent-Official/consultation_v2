import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import {
  makeMajorityJudgmentElectionKey,
  makeMajorityJudgmentVoterKeys,
  validateMajorityJudgmentVoteSlice
} from './governanceComponent'
import {
  CandidateHttpUrlStringSchema,
  canStartMajorityJudgmentRerun,
  canTransitionFromRoundOneFailure,
  GradeSchema,
  MajorityJudgmentElectionResponseSchema,
  MakeMajorityJudgmentElectionInputSchema,
  MakeMajorityJudgmentTieResolutionInputSchema,
  MakeMajorityJudgmentVoteInputSchema
} from './majorityJudgment'

const accountAddress =
  'account_tdx_2_1287t0ndg56s9zyxm8jg73fe42ash8enjjdm4hazxefenhexm0u67ed'

describe('majority judgment shared schemas', () => {
  it('keeps a failed first round closed until a rerun exists', () => {
    assert.isFalse(canTransitionFromRoundOneFailure('LIVE'))
    assert.isFalse(canTransitionFromRoundOneFailure('FINAL'))
    assert.isTrue(canTransitionFromRoundOneFailure('RERUN_PENDING'))
    assert.isTrue(canTransitionFromRoundOneFailure('RERUN_LIVE'))
  })

  it('opens a rerun only from a failed first round', () => {
    assert.isTrue(canStartMajorityJudgmentRerun('ROUND_1_FAILED'))
    assert.isFalse(canStartMajorityJudgmentRerun('LIVE'))
    assert.isFalse(canStartMajorityJudgmentRerun('FINAL'))
    assert.isFalse(canStartMajorityJudgmentRerun('TIE_UNRESOLVED'))
  })

  it('accepts all five grades and rejects values outside the on-ledger range', () => {
    for (const grade of [0, 1, 2, 3, 4]) {
      assert.isTrue(
        Schema.decodeUnknownEither(GradeSchema)(grade)._tag === 'Right'
      )
    }

    assert.isTrue(Schema.decodeUnknownEither(GradeSchema)(-1)._tag === 'Left')
    assert.isTrue(Schema.decodeUnknownEither(GradeSchema)(5)._tag === 'Left')
  })

  it('accepts only bounded HTTP(S) candidate links', () => {
    assert.strictEqual(
      Schema.decodeUnknownEither(CandidateHttpUrlStringSchema)(
        'https://example.com/candidate'
      )._tag,
      'Right'
    )
    for (const invalid of [
      'not a URL',
      'ftp://example.com/candidate',
      'https://example.com/ candidate',
      `https://example.com/${'x'.repeat(1_025)}`
    ]) {
      assert.strictEqual(
        Schema.decodeUnknownEither(CandidateHttpUrlStringSchema)(invalid)._tag,
        'Left'
      )
    }
  })

  it('validates a complete normalized ballot before manifest generation', () => {
    const valid = {
      accountAddress,
      electionId: 7,
      round: 'RoundOne',
      candidateIds: [0, 1, 2],
      grades: [
        { candidateId: 2, grade: 3 },
        { candidateId: 0, grade: 4 },
        { candidateId: 1, grade: 1 }
      ]
    }

    const decoded = Schema.decodeUnknownSync(
      MakeMajorityJudgmentVoteInputSchema
    )(valid)

    assert.deepStrictEqual(
      decoded.grades.map(({ candidateId }) => candidateId),
      [0, 1, 2]
    )
    assert.isTrue(
      Schema.decodeUnknownEither(MakeMajorityJudgmentVoteInputSchema)({
        ...valid,
        grades: valid.grades.slice(0, 2)
      })._tag === 'Left'
    )
    assert.isTrue(
      Schema.decodeUnknownEither(MakeMajorityJudgmentVoteInputSchema)({
        ...valid,
        grades: [
          { candidateId: 0, grade: 4 },
          { candidateId: 0, grade: 3 },
          { candidateId: 2, grade: 1 }
        ]
      })._tag === 'Left'
    )
  })

  it('validates election permutations and tie-resolution orders', () => {
    const creation = {
      accountAddress,
      title: 'Permanent RAC election',
      shortDescription: 'Elect two members',
      description: 'Candidate profiles',
      links: ['https://example.com/election'],
      roleId: 'rac-member',
      seatCount: 2,
      candidates: ['alice', 'bob', 'carol'].map((reference) => ({
        reference,
        displayName: reference,
        description: `${reference} profile`,
        links: [`https://example.com/${reference}`]
      })),
      parameterSetId: 'mj-rac',
      candidateOrder: [2, 0, 1]
    }

    assert.isTrue(
      Schema.decodeUnknownEither(MakeMajorityJudgmentElectionInputSchema)(
        creation
      )._tag === 'Right'
    )
    assert.isTrue(
      Schema.decodeUnknownEither(MakeMajorityJudgmentElectionInputSchema)({
        ...creation,
        candidateOrder: [2, 0, 0]
      })._tag === 'Left'
    )
    assert.isTrue(
      Schema.decodeUnknownEither(MakeMajorityJudgmentTieResolutionInputSchema)({
        accountAddress,
        electionId: 7,
        round: 'RoundOne',
        orderedCandidateIds: [1, 0]
      })._tag === 'Right'
    )
  })

  it('encodes direct Gateway keys without positional ambiguity', () => {
    assert.deepStrictEqual(makeMajorityJudgmentElectionKey(7), {
      key_json: { kind: 'U64', value: '7' }
    })
    assert.deepStrictEqual(makeMajorityJudgmentVoterKeys([accountAddress]), [
      { key_json: { kind: 'Reference', value: accountAddress } }
    ])
  })

  it.effect(
    'rejects an incomplete indexed vote slice before its cursor can advance',
    () =>
      Effect.gen(function* () {
        const complete = yield* Effect.either(
          validateMajorityJudgmentVoteSlice({
            fromIndexInclusive: 3,
            toIndexInclusive: 5,
            voteIds: [3, 4, 5]
          })
        )
        const missing = yield* Effect.either(
          validateMajorityJudgmentVoteSlice({
            fromIndexInclusive: 3,
            toIndexInclusive: 5,
            voteIds: [3, 5]
          })
        )

        assert.strictEqual(complete._tag, 'Right')
        assert.strictEqual(missing._tag, 'Left')
        if (missing._tag === 'Left') {
          assert.strictEqual(
            missing.left._tag,
            'MissingMajorityJudgmentVoteRecordsError'
          )
          assert.deepStrictEqual(missing.left.missingVoteIds, [4])
        }
      })
  )

  it('decodes the persisted API response and rejects malformed decimal data', () => {
    const response = {
      election: {
        id: 7,
        temperatureCheckId: 3,
        roleId: 'rac-member',
        title: 'Permanent RAC election',
        shortDescription: 'Elect two members',
        description: 'Candidate profiles',
        seatCount: 2,
        snapshotAt: '2026-06-01T00:00:00.000Z',
        tcVotingStart: '2026-07-01T00:00:00.000Z',
        tcVotingEnd: '2026-07-08T00:00:00.000Z',
        tcQuorumXrd: '300000',
        tcApprovalThreshold: '0.5',
        tcOutcome: 'PASSED',
        tcOutcomeRecordedAt: '2026-07-08T00:00:00.000Z',
        parameterSetId: 'mj-rac',
        parameterSetVersion: 1,
        reserveListDays: 90,
        status: 'LIVE',
        hidden: false
      },
      candidates: [
        {
          id: 0,
          reference: 'alice',
          displayName: 'Alice',
          description: 'Profile',
          links: ['https://example.com/alice'],
          displayOrder: 0
        }
      ],
      currentRound: {
        round: 'RoundOne',
        snapshotAt: '2026-06-01T00:00:00.000Z',
        votingStart: '2026-07-08T00:00:00.000Z',
        votingEnd: '2026-07-15T00:00:00.000Z',
        quorumXrd: '1000000',
        minimumMedianGrade: 2
      },
      temperatureCheckResult: {
        tcParametersProjected: true,
        cacheAvailable: true,
        forVotingPower: '600000',
        againstVotingPower: '400000',
        participationXrd: '1000000',
        quorumXrd: '300000',
        quorumMet: true,
        approvalThreshold: '0.5',
        forShare: '0.6',
        approvalMet: true,
        calculatedPassed: true,
        recordedPassed: true,
        outcomeConsistent: true,
        passed: true,
        recordedAt: '2026-07-08T00:00:00.000Z'
      },
      result: {
        status: 'LIVE',
        round: 'RoundOne',
        provisional: true,
        totalVotingPower: '500000',
        quorumXrd: '1000000',
        quorumMet: false,
        minimumMedianGrade: 2,
        candidateResults: [
          {
            candidateId: 0,
            histogram: ['0', '0', '100000', '200000', '200000'],
            majorityGrade: 3,
            finalMajorityGrade: 3,
            electable: true,
            rank: 1,
            outcome: 'SEATED'
          }
        ],
        seatedCandidateIds: [0],
        reserveCandidateIds: [],
        reserveExpiresAt: null,
        referredSeats: 1,
        tieBreakIterations: 0,
        unresolvedCandidateIds: []
      }
    }
    const responseWithHistory = {
      ...response,
      rounds: [response.currentRound],
      results: [response.result]
    }

    assert.isTrue(
      Schema.decodeUnknownEither(MajorityJudgmentElectionResponseSchema)(
        responseWithHistory
      )._tag === 'Right'
    )
    assert.isTrue(
      Schema.decodeUnknownEither(MajorityJudgmentElectionResponseSchema)({
        ...responseWithHistory,
        currentRound: null,
        rounds: [],
        result: undefined,
        results: []
      })._tag === 'Right'
    )
    assert.isTrue(
      Schema.decodeUnknownEither(MajorityJudgmentElectionResponseSchema)({
        ...responseWithHistory,
        result: {
          ...responseWithHistory.result,
          totalVotingPower: 'not-a-decimal'
        }
      })._tag === 'Left'
    )
  })
})
