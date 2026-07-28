import { assert, describe, it, vi } from 'vitest'
import { secureShuffleCandidateIds } from './candidateOrder'

describe('secure candidate display order', () => {
  it('returns an exact permutation without mutating the commitment', () => {
    const source = [0, 1, 2, 3]
    const getRandomValues = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        if (array instanceof Uint32Array) array[0] = 0
        return array
      })

    const shuffled = secureShuffleCandidateIds(source)

    assert.deepStrictEqual(source, [0, 1, 2, 3])
    assert.deepStrictEqual(
      [...shuffled].sort((a, b) => a - b),
      source
    )
    assert.deepStrictEqual(shuffled, [1, 2, 3, 0])
    getRandomValues.mockRestore()
  })
})
