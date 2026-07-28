import { assert, describe, it } from 'vitest'
import { parseCandidateLinks } from './CandidatesField'

describe('candidate link input', () => {
  it('preserves an empty trailing entry while another link is entered', () => {
    assert.deepStrictEqual(parseCandidateLinks('https://one.example, '), [
      'https://one.example',
      ''
    ])
  })

  it('caps the editor at five links', () => {
    assert.deepStrictEqual(parseCandidateLinks('1,2,3,4,5,6'), [
      '1',
      '2',
      '3',
      '4',
      '5'
    ])
  })
})
