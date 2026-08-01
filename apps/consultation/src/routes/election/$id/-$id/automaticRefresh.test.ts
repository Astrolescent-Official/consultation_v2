import { assert, describe, it } from 'vitest'
import { automaticElectionRefreshDelay } from './automaticRefresh'

describe('election projection refresh', () => {
  it('backs off and stops automatic polling after five attempts', () => {
    assert.deepStrictEqual(
      Array.from({ length: 6 }, (_, attempt) =>
        automaticElectionRefreshDelay(attempt)
      ),
      [3_000, 6_000, 12_000, 24_000, 48_000, undefined]
    )
  })
})
