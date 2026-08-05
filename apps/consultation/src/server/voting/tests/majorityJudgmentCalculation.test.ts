import { assert, describe, it } from 'vitest'
import {
  applyMajorityJudgmentTieResolution,
  calculateMajorityJudgment,
  majorityGrade
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

  it('orders equal medians by majority-gauge band', () => {
    const grades = [
      [4, 4, 4, 4, 2, 2, 2, 2, 2, 0],
      [4, 4, 2, 2, 2, 2, 2, 2, 0, 0],
      [4, 2, 2, 2, 2, 2, 0, 0, 0, 0]
    ] as const
    const result = calculate(
      Array.from({ length: 10 }, (_, voteId) =>
        ballot(
          `account-${voteId}`,
          voteId,
          '1',
          grades.map((candidateGrades, candidateId) => [
            candidateId,
            candidateGrades[voteId] ?? 0
          ])
        )
      ),
      { seatCount: 3 }
    )

    assert.deepStrictEqual(
      result.candidateResults.map(({ qualifyingGrade, band, rank }) => ({
        qualifyingGrade,
        band,
        rank
      })),
      [
        { qualifyingGrade: 2, band: 'A', rank: 1 },
        { qualifyingGrade: 2, band: 'B', rank: 2 },
        { qualifyingGrade: 2, band: 'C', rank: 3 }
      ]
    )
  })

  it('orders within band A by higher exact power above', () => {
    const result = calculate(
      [
        ballot('account-a', 0, '1', [
          [0, 4],
          [1, 2],
          [2, 0]
        ]),
        ballot('account-b', 1, '2', [
          [0, 4],
          [1, 4],
          [2, 0]
        ]),
        ballot('account-c', 2, '1', [
          [0, 0],
          [1, 0],
          [2, 0]
        ]),
        ballot('account-d', 3, '6', [
          [0, 2],
          [1, 2],
          [2, 0]
        ])
      ],
      { seatCount: 2 }
    )

    assert.deepStrictEqual(result.seatedCandidateIds, [0, 1])
    assert.deepStrictEqual(
      result.candidateResults.slice(0, 2).map(({ band, powerAbove, rank }) => ({
        band,
        powerAbove,
        rank
      })),
      [
        { band: 'A', powerAbove: '3', rank: 1 },
        { band: 'A', powerAbove: '2', rank: 2 }
      ]
    )
  })

  it('leaves band B inseparable regardless of p/q magnitude', () => {
    const grades = [
      [4, 2, 2, 2, 2, 2, 2, 2, 2, 0],
      [4, 4, 4, 4, 2, 2, 0, 0, 0, 0]
    ] as const
    const result = calculate(
      Array.from({ length: 10 }, (_, voteId) =>
        ballot(
          `account-${voteId}`,
          voteId,
          '1',
          grades.map((candidateGrades, candidateId) => [
            candidateId,
            candidateGrades[voteId] ?? 0
          ])
        )
      ),
      { candidates: [candidate(0), candidate(1)] }
    )

    assert.strictEqual(result.status, 'TIE_UNRESOLVED')
    assert.deepStrictEqual(result.unresolvedCandidateIds, [0, 1])
    assert.deepStrictEqual(
      result.candidateResults.map(({ rank }) => rank),
      [1, 1]
    )
    assert.deepStrictEqual(
      result.candidateResults.map(({ p, q }) => [p, q]),
      [
        ['0.1', '0.1'],
        ['0.4', '0.4']
      ]
    )
    assert.isNotNull(result.candidateResults[0]?.tieGroupId)
    assert.strictEqual(
      result.candidateResults[0]?.tieGroupId,
      result.candidateResults[1]?.tieGroupId
    )
  })

  it('leaves equal-p band A candidates inseparable', () => {
    const grades = [
      [4, 4, 4, 4, 2, 2, 2, 2, 2, 0],
      [4, 4, 4, 4, 2, 2, 2, 2, 2, 2]
    ] as const
    const result = calculate(
      Array.from({ length: 10 }, (_, voteId) =>
        ballot(
          `account-${voteId}`,
          voteId,
          '1',
          grades.map((candidateGrades, candidateId) => [
            candidateId,
            candidateGrades[voteId] ?? 0
          ])
        )
      ),
      { candidates: [candidate(0), candidate(1)] }
    )

    assert.strictEqual(result.status, 'TIE_UNRESOLVED')
    assert.deepStrictEqual(result.unresolvedCandidateIds, [0, 1])
    assert.deepStrictEqual(
      result.candidateResults.map(({ band, p }) => [band, p]),
      [
        ['A', '0.4'],
        ['A', '0.4']
      ]
    )
  })

  it('compares exact power sums beyond normalized-share precision', () => {
    const epsilon = '1.0000000000000000000001'
    const result = calculate(
      [
        ballot('account-a', 0, epsilon, [
          [0, 4],
          [1, 0]
        ]),
        ballot('account-b', 1, '1', [
          [0, 0],
          [1, 4]
        ]),
        ballot('account-c', 2, '1', [
          [0, 2],
          [1, 2]
        ])
      ],
      { candidates: [candidate(0), candidate(1)] }
    )

    assert.strictEqual(result.status, 'FINAL')
    assert.deepStrictEqual(result.seatedCandidateIds, [0])
    assert.deepStrictEqual(
      result.candidateResults.map(({ powerAbove, powerBelow, band }) => ({
        powerAbove,
        powerBelow,
        band
      })),
      [
        { powerAbove: epsilon, powerBelow: '1', band: 'A' },
        { powerAbove: '1', powerBelow: epsilon, band: 'C' }
      ]
    )
  })

  it('publishes competition ranks and standing reserve tie groups', () => {
    const grades = [
      [4, 4, 4, 4, 2, 2, 2, 2, 2, 0],
      [4, 2, 2, 2, 2, 2, 2, 2, 2, 0],
      [4, 4, 4, 4, 2, 2, 0, 0, 0, 0],
      [4, 2, 2, 2, 2, 2, 0, 0, 0, 0]
    ] as const
    const result = calculate(
      Array.from({ length: 10 }, (_, voteId) =>
        ballot(
          `account-${voteId}`,
          voteId,
          '1',
          grades.map((candidateGrades, candidateId) => [
            candidateId,
            candidateGrades[voteId] ?? 0
          ])
        )
      ),
      {
        candidates: [candidate(0), candidate(1), candidate(2), candidate(3)],
        seatCount: 1
      }
    )

    assert.strictEqual(result.status, 'FINAL')
    assert.deepStrictEqual(result.unresolvedCandidateIds, [])
    assert.deepStrictEqual(
      result.candidateResults.map(({ rank }) => rank),
      [1, 2, 2, 4]
    )
    assert.strictEqual(
      result.candidateResults[1]?.tieGroupId,
      result.candidateResults[2]?.tieGroupId
    )
    assert.isNotNull(result.candidateResults[1]?.tieGroupId)
    assert.deepStrictEqual(result.reserveCandidateIds, [1, 2, 3])
  })

  it('halts identically for every seat-boundary tie-group size', () => {
    for (const size of [2, 5]) {
      const candidates = Array.from({ length: size }, (_, id) => candidate(id))
      const result = calculate(
        [
          ballot(
            'account-a',
            0,
            '10',
            candidates.map(({ id }) => [id, 4])
          )
        ],
        { candidates, seatCount: 1 }
      )

      assert.strictEqual(result.status, 'TIE_UNRESOLVED')
      assert.deepStrictEqual(
        result.unresolvedCandidateIds,
        candidates.map(({ id }) => id)
      )
      assert.deepStrictEqual(result.seatedCandidateIds, [])
      assert.notMatch(JSON.stringify(result), /RUNOFF|governanceRoute|route/)
    }
  })

  it('excludes an incomplete ballot from the entire tally', () => {
    const result = calculate(
      [
        ballot('valid', 0, '10', [
          [0, 4],
          [1, 2]
        ]),
        ballot('incomplete', 1, '100', [[0, 0]])
      ],
      { candidates: [candidate(0), candidate(1)], seatCount: 2 }
    )

    assert.strictEqual(result.totalVotingPower, '10')
    assert.deepStrictEqual(
      result.candidateResults.map(({ qualifyingGrade }) => qualifyingGrade),
      [4, 2]
    )
  })

  it('applies the qualifying-grade floor before a stronger gauge can affect seating', () => {
    const grades = [
      [4, 4, 4, 4, 1, 1, 1, 1, 1, 0],
      [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
    ] as const
    const result = calculate(
      Array.from({ length: 10 }, (_, voteId) =>
        ballot(
          `account-${voteId}`,
          voteId,
          '1',
          grades.map((candidateGrades, candidateId) => [
            candidateId,
            candidateGrades[voteId] ?? 0
          ])
        )
      ),
      {
        candidates: [candidate(0), candidate(1)],
        minimumMedianGrade: 2
      }
    )

    assert.deepStrictEqual(result.seatedCandidateIds, [1])
    assert.deepStrictEqual(
      result.candidateResults.map(({ qualifyingGrade, band, rank }) => ({
        qualifyingGrade,
        band,
        rank
      })),
      [
        { qualifyingGrade: 1, band: null, rank: null },
        { qualifyingGrade: 2, band: 'B', rank: 1 }
      ]
    )
  })

  it('finds at most one straddling tie group across random histograms', () => {
    let state = 0x1234abcd
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state
    }

    for (let fixture = 0; fixture < 100; fixture += 1) {
      const candidates = Array.from({ length: 8 }, (_, id) => candidate(id))
      const ballots = Array.from({ length: 25 }, (_, voteId) =>
        ballot(
          `account-${voteId}`,
          voteId,
          String((random() % 10) + 1),
          candidates.map(({ id }) => [id, random() % 5])
        )
      )
      const seatCount = (random() % candidates.length) + 1
      const result = calculate(ballots, { candidates, seatCount })

      if (result.unresolvedCandidateIds.length > 0) {
        const unresolved = result.candidateResults.filter(({ candidateId }) =>
          result.unresolvedCandidateIds.includes(candidateId)
        )
        assert.strictEqual(
          new Set(unresolved.map(({ tieGroupId }) => tieGroupId)).size,
          1
        )
        const rank = unresolved[0]?.rank
        assert.isNumber(rank)
        assert.isBelow(rank as number, seatCount + 1)
        assert.isAbove((rank as number) + unresolved.length, seatCount)
      }
    }
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

  it('narrows the unresolved group when a candidate separates above the boundary', () => {
    const result = calculate(
      [
        ballot('account-a', 0, '1', [
          [0, 4],
          [1, 3],
          [2, 3]
        ]),
        ballot('account-b', 1, '5', [
          [0, 3],
          [1, 3],
          [2, 3]
        ]),
        ballot('account-c', 2, '6', [
          [0, 4],
          [1, 4],
          [2, 4]
        ])
      ],
      { seatCount: 2 }
    )

    assert.strictEqual(result.status, 'TIE_UNRESOLVED')
    assert.deepStrictEqual(
      result.candidateResults.map(({ qualifyingGrade }) => qualifyingGrade),
      [4, 4, 4]
    )
    assert.deepStrictEqual(result.unresolvedCandidateIds, [1, 2])
    assert.deepStrictEqual(result.seatedCandidateIds, [0])

    const resolved = applyMajorityJudgmentTieResolution({
      result,
      orderedCandidateIds: [2, 1],
      seatCount: 2,
      roundEndsAt: new Date('2026-07-01T00:00:00.000Z'),
      reserveListDays: 90
    })
    assert.deepStrictEqual(resolved.seatedCandidateIds, [0, 2])
    assert.deepStrictEqual(resolved.reserveCandidateIds, [1])
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
    assert.strictEqual(firstRound.status, 'ROUND_1_FAILED')

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
