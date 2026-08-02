import type { Grade } from 'shared/governance/index'
import { assert, describe, it } from 'vitest'
import {
  dedupeMajorityJudgmentVotes,
  prepareMajorityJudgmentBallots
} from '../majority-judgment/calculation'
import {
  deriveAuthoritativeTemperatureCheckOutcome,
  deriveMajorityJudgmentPhase,
  deriveMajorityJudgmentRerunPhase,
  deriveMajorityJudgmentTemperatureCheckPhase,
  deriveProjectedTemperatureCheckOutcome
} from '../majority-judgment/projection'

const grades = (first: Grade, second: Grade) => [
  { candidateId: 0, grade: first },
  { candidateId: 1, grade: second }
]

describe('majority judgment collector preparation', () => {
  it('deduplicates a fetched slice by account using the greatest vote id', () => {
    const deduped = dedupeMajorityJudgmentVotes([
      {
        voteId: 3,
        accountAddress: 'account-b',
        grades: grades(4, 1)
      },
      {
        voteId: 1,
        accountAddress: 'account-a',
        grades: grades(1, 4)
      },
      {
        voteId: 4,
        accountAddress: 'account-a',
        grades: grades(3, 2)
      }
    ])

    assert.deepStrictEqual(
      deduped.map(({ accountAddress, voteId }) => ({
        accountAddress,
        voteId
      })),
      [
        { accountAddress: 'account-a', voteId: 4 },
        { accountAddress: 'account-b', voteId: 3 }
      ]
    )
  })

  it('reuses round-local power on revote and excludes zero-power first votes', () => {
    const prepared = prepareMajorityJudgmentBallots({
      votes: [
        {
          voteId: 4,
          accountAddress: 'account-a',
          grades: grades(3, 2)
        },
        {
          voteId: 5,
          accountAddress: 'account-zero',
          grades: grades(4, 4)
        },
        {
          voteId: 6,
          accountAddress: 'account-new',
          grades: grades(2, 3)
        }
      ],
      existingBallots: [
        {
          accountAddress: 'account-a',
          voteId: 1n,
          grades: grades(1, 4),
          votingPower: '10',
          castAt: new Date('2026-07-01T00:00:00.000Z')
        }
      ],
      firstTimeVotingPower: {
        'account-zero': '0',
        'account-new': '12.5'
      },
      castAt: new Date('2026-07-10T00:00:00.000Z')
    })

    assert.deepStrictEqual(
      prepared.map(({ accountAddress, voteId, votingPower }) => ({
        accountAddress,
        voteId,
        votingPower
      })),
      [
        { accountAddress: 'account-a', voteId: 4n, votingPower: '10' },
        {
          accountAddress: 'account-new',
          voteId: 6n,
          votingPower: '12.5'
        }
      ]
    )
  })
})

describe('majority judgment projected phase', () => {
  const boundaries = {
    tcVotingStart: new Date('2026-07-01T00:00:00.000Z'),
    tcVotingEnd: new Date('2026-07-08T00:00:00.000Z'),
    votingStart: new Date('2026-07-08T00:00:00.000Z'),
    votingEnd: new Date('2026-07-15T00:00:00.000Z'),
    tcOutcome: 'PENDING' as const
  }

  it('derives pre-vote phases and treats the voting deadline as closed', () => {
    assert.strictEqual(
      deriveMajorityJudgmentPhase(
        new Date('2026-06-30T23:59:59.999Z'),
        boundaries
      ),
      'PENDING'
    )
    assert.strictEqual(
      deriveMajorityJudgmentPhase(
        new Date('2026-07-01T00:00:00.000Z'),
        boundaries
      ),
      'TC_LIVE'
    )
    assert.strictEqual(
      deriveMajorityJudgmentPhase(new Date('2026-07-08T00:00:00.000Z'), {
        ...boundaries,
        tcOutcome: 'PASSED'
      }),
      'LIVE'
    )
    assert.strictEqual(
      deriveMajorityJudgmentPhase(new Date('2026-07-15T00:00:00.000Z'), {
        ...boundaries,
        tcOutcome: 'PASSED'
      }),
      'LIVE'
    )
  })

  it('leaves an ended rerun eligible for deadline finalization', () => {
    const start = new Date('2026-07-20T00:00:00.000Z')
    const deadline = new Date('2026-07-27T00:00:00.000Z')

    assert.strictEqual(
      deriveMajorityJudgmentRerunPhase(
        new Date('2026-07-19T23:59:59.999Z'),
        start,
        deadline
      ),
      'RERUN_PENDING'
    )
    assert.strictEqual(
      deriveMajorityJudgmentRerunPhase(deadline, start, deadline),
      'RERUN_LIVE'
    )
  })

  it('fails a recorded TC pass closed when the weighted verdict failed', () => {
    assert.strictEqual(
      deriveAuthoritativeTemperatureCheckOutcome('PASSED', false),
      'FAILED'
    )
    assert.strictEqual(
      deriveAuthoritativeTemperatureCheckOutcome('PASSED', true),
      'PASSED'
    )
    assert.strictEqual(
      deriveAuthoritativeTemperatureCheckOutcome('PENDING', true),
      'PENDING'
    )
  })

  it('keeps a recorded pass at the projection gate until weighted verification', () => {
    assert.strictEqual(deriveProjectedTemperatureCheckOutcome(null), 'PENDING')
    assert.strictEqual(deriveProjectedTemperatureCheckOutcome(true), 'PENDING')
    assert.strictEqual(deriveProjectedTemperatureCheckOutcome(false), 'FAILED')
  })

  it('derives the round-free operator wait from TC boundaries alone', () => {
    assert.strictEqual(
      deriveMajorityJudgmentTemperatureCheckPhase(
        new Date('2026-07-08T00:00:00.000Z'),
        {
          tcVotingStart: boundaries.tcVotingStart,
          tcVotingEnd: boundaries.tcVotingEnd,
          tcOutcome: 'PASSED'
        }
      ),
      'MJ_PENDING'
    )
    assert.strictEqual(
      deriveMajorityJudgmentTemperatureCheckPhase(
        new Date('2026-07-08T00:00:00.000Z'),
        {
          tcVotingStart: boundaries.tcVotingStart,
          tcVotingEnd: boundaries.tcVotingEnd,
          tcOutcome: 'FAILED'
        }
      ),
      'TC_FAILED'
    )
  })
})
