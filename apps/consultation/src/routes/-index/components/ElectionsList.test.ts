import { Option } from 'effect'
import { assert, describe, it } from 'vitest'
import { electionDates, selectVisibleElections } from './ElectionsList'

describe('majority judgment election list', () => {
  const elections = [
    { id: 1, hidden: false },
    { id: 3, hidden: true },
    { id: 2, hidden: false }
  ]

  it('hides owner-hidden elections from public discovery and sorts by id', () => {
    assert.deepStrictEqual(
      selectVisibleElections(elections, false, 'desc').map(({ id }) => id),
      [2, 1]
    )
    assert.deepStrictEqual(
      selectVisibleElections(elections, true, 'asc').map(({ id }) => id),
      [1, 2, 3]
    )
  })

  it('uses the TC window until the operator opens Round 1', () => {
    const tcVotingEnd = new Date('2026-08-02T00:00:00.000Z')
    assert.deepStrictEqual(
      electionDates({
        tcVotingStart: new Date('2026-08-01T00:00:00.000Z'),
        tcVotingEnd,
        roundOne: Option.none(),
        rerun: Option.none()
      }).deadline,
      tcVotingEnd
    )
  })
})
