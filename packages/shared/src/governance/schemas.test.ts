import { assert, describe, it } from '@effect/vitest'
import { Schema } from 'effect'
import { TemperatureCheckFollowUpInputSchema } from './schemas'

describe('temperature check follow-up input', () => {
  it('keeps two standard vote options while allowing one MJ candidate', () => {
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFollowUpInputSchema)({
        _tag: 'StandardProposal',
        voteOptions: ['For'],
        maxSelections: 1
      })._tag,
      'Left'
    )
    assert.strictEqual(
      Schema.decodeUnknownEither(TemperatureCheckFollowUpInputSchema)({
        _tag: 'MajorityJudgmentElection',
        roleId: 'permanent-rac',
        seatCount: 1,
        candidates: [
          {
            reference: 'alice',
            displayName: 'Alice',
            description: 'Candidate profile',
            links: []
          }
        ]
      })._tag,
      'Right'
    )
  })
})
