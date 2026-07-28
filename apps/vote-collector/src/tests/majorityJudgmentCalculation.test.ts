import { assert, describe, it } from 'vitest'
import {
  applyMajorityJudgmentTieResolution,
  calculateMajorityJudgment,
  majorityGrade,
  selectMedianContribution
} from '../majority-judgment/calculator'

const candidate = (id: number) => ({ id })

const ballot = (
  accountAddress: string,
  voteId: number,
  votingPower: string,
  grades: ReadonlyArray<readonly [number, number]>
) => ({
  accountAddress,
  voteId,
  votingPower,
  grades: grades.map(([candidateId, grade]) => ({ candidateId, grade }))
})

const calculate = (
  ballots: ReadonlyArray<ReturnType<typeof ballot>>,
  overrides: Partial<Parameters<typeof calculateMajorityJudgment>[0]> = {}
) =>
  calculateMajorityJudgment({
    candidates: [candidate(0), candidate(1), candidate(2)],
    ballots,
    seatCount: 1,
    quorumXrd: '1',
    minimumMedianGrade: 0,
    reserveListDays: 90,
    roundEndsAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides
  })

describe('majority judgment weighted calculation', () => {
  it('finds every majority grade and uses the exact-half >= boundary', () => {
    for (const grade of [0, 1, 2, 3, 4]) {
      assert.strictEqual(majorityGrade([{ grade, votingPower: '7' }]), grade)
    }

    assert.strictEqual(
      majorityGrade([
        { grade: 4, votingPower: '5' },
        { grade: 0, votingPower: '5' }
      ]),
      4
    )
    assert.isNull(majorityGrade([]))
  })

  it('uses exact decimal voting power without converting through number', () => {
    assert.strictEqual(
      majorityGrade([
        { grade: 4, votingPower: '0.000000000000000001' },
        { grade: 1, votingPower: '999999999999999999.999999999999999999' }
      ]),
      1
    )
  })

  it('applies the grade floor, seats, reserves, referrals, and expiry', () => {
    const result = calculate(
      [
        ballot('account-a', 0, '10', [
          [0, 4],
          [1, 3],
          [2, 1]
        ])
      ],
      { seatCount: 2, minimumMedianGrade: 2 }
    )

    assert.deepStrictEqual(result.seatedCandidateIds, [0, 1])
    assert.deepStrictEqual(result.reserveCandidateIds, [])
    assert.strictEqual(result.referredSeats, 0)
    assert.strictEqual(
      result.reserveExpiresAt?.toISOString(),
      '2026-09-29T00:00:00.000Z'
    )

    const referred = calculate(
      [
        ballot('account-a', 0, '10', [
          [0, 4],
          [1, 1],
          [2, 0]
        ])
      ],
      { seatCount: 3, minimumMedianGrade: 2 }
    )
    assert.deepStrictEqual(referred.seatedCandidateIds, [0])
    assert.strictEqual(referred.referredSeats, 2)
  })

  it('classifies fixed quorum immediately below, equal to, and above the threshold', () => {
    for (const [power, quorumMet] of [
      ['9.999999999999999999', false],
      ['10', true],
      ['10.000000000000000001', true]
    ] as const) {
      const result = calculate(
        [
          ballot('account-a', 0, power, [
            [0, 4],
            [1, 3],
            [2, 2]
          ])
        ],
        { quorumXrd: '10' }
      )
      assert.strictEqual(result.quorumMet, quorumMet)
    }
  })

  it('breaks a consequential tie with candidate-local removals', () => {
    const result = calculate([
      ballot('account-a', 0, '1', [
        [0, 4],
        [1, 3],
        [2, 0]
      ]),
      ballot('account-b', 1, '5', [
        [0, 3],
        [1, 3],
        [2, 0]
      ]),
      ballot('account-c', 2, '6', [
        [0, 4],
        [1, 4],
        [2, 0]
      ])
    ])

    assert.deepStrictEqual(result.seatedCandidateIds, [0])
    assert.strictEqual(result.tieBreakIterations, 1)
    assert.deepStrictEqual(result.unresolvedCandidateIds, [])
  })

  it('uses voting power, account address, then vote id to select a removal', () => {
    const selected = selectMedianContribution(
      [
        {
          accountAddress: 'account-c',
          voteId: 1,
          grade: 3,
          votingPower: '2'
        },
        {
          accountAddress: 'account-b',
          voteId: 2,
          grade: 3,
          votingPower: '1'
        },
        {
          accountAddress: 'account-a',
          voteId: 9,
          grade: 3,
          votingPower: '1'
        },
        {
          accountAddress: 'account-a',
          voteId: 3,
          grade: 3,
          votingPower: '1'
        }
      ],
      3
    )

    assert.deepStrictEqual(selected, {
      accountAddress: 'account-a',
      voteId: 3,
      grade: 3,
      votingPower: '1'
    })
  })

  it('records an unresolved consequential tie without choosing by candidate id', () => {
    const result = calculate([
      ballot('account-a', 0, '10', [
        [0, 4],
        [1, 4],
        [2, 0]
      ])
    ])

    assert.deepStrictEqual(result.seatedCandidateIds, [])
    assert.deepStrictEqual(result.unresolvedCandidateIds, [0, 1])

    const resolved = applyMajorityJudgmentTieResolution({
      result,
      orderedCandidateIds: [1, 0],
      seatCount: 1,
      roundEndsAt: new Date('2026-07-01T00:00:00.000Z'),
      reserveListDays: 90
    })
    assert.strictEqual(resolved.status, 'FINAL')
    assert.deepStrictEqual(resolved.seatedCandidateIds, [1])
    assert.deepStrictEqual(resolved.reserveCandidateIds, [0, 2])
    assert.deepStrictEqual(resolved.unresolvedCandidateIds, [])

    assert.throws(
      () =>
        applyMajorityJudgmentTieResolution({
          result,
          orderedCandidateIds: [0],
          seatCount: 1,
          roundEndsAt: new Date('2026-07-01T00:00:00.000Z'),
          reserveListDays: 90
        }),
      /exact unresolved candidate group/
    )
  })

  it('still decides candidates outside the unresolved group', () => {
    // Candidate 0 is graded Excellent by everyone and candidate 3 Acceptable by
    // everyone, so both are decided no matter how the 1-vs-2 tie is settled.
    const result = calculate(
      [
        ballot('account-a', 0, '10', [
          [0, 4],
          [1, 2],
          [2, 2],
          [3, 1]
        ]),
        ballot('account-b', 1, '10', [
          [0, 4],
          [1, 2],
          [2, 2],
          [3, 1]
        ])
      ],
      {
        candidates: [candidate(0), candidate(1), candidate(2), candidate(3)],
        seatCount: 2
      }
    )

    assert.strictEqual(result.status, 'TIE_UNRESOLVED')
    assert.deepStrictEqual(result.unresolvedCandidateIds, [1, 2])
    assert.deepStrictEqual(result.seatedCandidateIds, [0])
    assert.deepStrictEqual(result.reserveCandidateIds, [3])
    // The contested seat is pending the governance determination, not referred.
    assert.strictEqual(result.referredSeats, 0)
    assert.strictEqual(
      result.candidateResults.find(({ candidateId }) => candidateId === 0)
        ?.outcome,
      'SEATED'
    )
    assert.strictEqual(
      result.candidateResults.find(({ candidateId }) => candidateId === 3)
        ?.outcome,
      'RESERVE'
    )

    const resolved = applyMajorityJudgmentTieResolution({
      result,
      orderedCandidateIds: [2, 1],
      seatCount: 2,
      roundEndsAt: new Date('2026-07-01T00:00:00.000Z'),
      reserveListDays: 90
    })
    assert.strictEqual(resolved.status, 'FINAL')
    assert.deepStrictEqual(resolved.seatedCandidateIds, [0, 2])
    assert.deepStrictEqual(resolved.reserveCandidateIds, [1, 3])
    assert.strictEqual(resolved.referredSeats, 0)
  })

  it('uses rerun quorum and grade-floor rules independently', () => {
    const firstRound = calculate(
      [
        ballot('account-a', 0, '9', [
          [0, 3],
          [1, 2],
          [2, 1]
        ])
      ],
      { quorumXrd: '10', minimumMedianGrade: 2, round: 'RoundOne' }
    )
    assert.strictEqual(firstRound.status, 'RERUN_PENDING')

    const rerun = calculate(
      [
        ballot('account-a', 0, '9', [
          [0, 3],
          [1, 2],
          [2, 1]
        ])
      ],
      { quorumXrd: '8', minimumMedianGrade: 3, round: 'Rerun' }
    )
    assert.strictEqual(rerun.status, 'FINAL')
    assert.deepStrictEqual(rerun.seatedCandidateIds, [0])

    const failedRerun = calculate([], {
      quorumXrd: '8',
      minimumMedianGrade: 3,
      round: 'Rerun'
    })
    assert.strictEqual(failedRerun.status, 'FAILED')
  })

  it('returns byte-for-byte equivalent results for every input insertion order', () => {
    const ballots = [
      ballot('account-c', 3, '4', [
        [0, 2],
        [1, 4],
        [2, 1]
      ]),
      ballot('account-a', 1, '2', [
        [0, 4],
        [1, 1],
        [2, 3]
      ]),
      ballot('account-b', 2, '3', [
        [0, 3],
        [1, 2],
        [2, 4]
      ])
    ]

    assert.strictEqual(
      JSON.stringify(calculate(ballots)),
      JSON.stringify(calculate([...ballots].reverse()))
    )
  })

  it(
    'calculates the maximum representative election within two seconds',
    { timeout: 10_000 },
    () => {
      const candidates = Array.from({ length: 20 }, (_, id) => candidate(id))
      const candidateGrades = candidates.map(({ id }) => [id, 4] as const)
      const ballots = Array.from({ length: 10_000 }, (_, index) =>
        ballot(
          `account-${String(index).padStart(5, '0')}`,
          index,
          '1',
          candidateGrades
        )
      )
      const startedAt = performance.now()

      const result = calculateMajorityJudgment({
        candidates,
        ballots,
        seatCount: 5,
        quorumXrd: '1',
        minimumMedianGrade: 0,
        reserveListDays: 90,
        roundEndsAt: new Date('2026-07-01T00:00:00.000Z')
      })

      assert.strictEqual(result.status, 'TIE_UNRESOLVED')
      assert.isBelow(performance.now() - startedAt, 2_000)
    }
  )
})
