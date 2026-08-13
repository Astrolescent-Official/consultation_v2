import { assert, describe, it } from 'vitest'
import { selectVisibleElections } from './ElectionsList'

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
})
