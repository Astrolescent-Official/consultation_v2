import { assert, describe, it } from 'vitest'
import { dedupeGovernanceActions } from '../governanceEvents'

describe('governance event action routing', () => {
  it('keeps the latest vote count per majority-judgment round', () => {
    const actions = dedupeGovernanceActions([
      {
        _tag: 'MajorityJudgmentCreated',
        electionId: 7,
        observedAt: new Date('2026-07-01T00:00:00.000Z'),
        stateVersion: 100
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'RoundOne',
        voteCount: 2,
        observedAt: new Date('2026-07-09T00:00:00.000Z'),
        stateVersion: 101
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'RoundOne',
        voteCount: 4,
        observedAt: new Date('2026-07-10T00:00:00.000Z'),
        stateVersion: 103
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'Rerun',
        voteCount: 1,
        observedAt: new Date('2026-07-20T00:00:00.000Z'),
        stateVersion: 104
      }
    ])

    assert.deepStrictEqual(
      actions.map((action) =>
        action._tag === 'MajorityJudgmentVotesChanged'
          ? [action._tag, action.round, action.voteCount]
          : [action._tag]
      ),
      [
        ['MajorityJudgmentCreated'],
        ['MajorityJudgmentVotesChanged', 'RoundOne', 4],
        ['MajorityJudgmentVotesChanged', 'Rerun', 1]
      ]
    )
  })

  it('keeps replaced actions at their latest ledger position', () => {
    const actions = dedupeGovernanceActions([
      {
        _tag: 'MajorityJudgmentVisibilityChanged',
        electionId: 7,
        observedAt: new Date('2026-07-09T00:00:00.000Z'),
        stateVersion: 100
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'RoundOne',
        voteCount: 1,
        observedAt: new Date('2026-07-10T00:00:00.000Z'),
        stateVersion: 101
      },
      {
        _tag: 'MajorityJudgmentVisibilityChanged',
        electionId: 7,
        observedAt: new Date('2026-07-11T00:00:00.000Z'),
        stateVersion: 102
      }
    ])

    assert.deepStrictEqual(
      actions.map((action) => [
        action._tag,
        'stateVersion' in action ? action.stateVersion : undefined
      ]),
      [
        ['MajorityJudgmentVotesChanged', 101],
        ['MajorityJudgmentVisibilityChanged', 102]
      ]
    )
  })
})
