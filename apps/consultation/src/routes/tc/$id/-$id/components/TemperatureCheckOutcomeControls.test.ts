import { assert, describe, it } from 'vitest'
import { calculateTemperatureCheckOutcome } from './TemperatureCheckOutcomeControls'

describe('temperature check outcome controls', () => {
  it('requires both quorum and approval before offering a pass', () => {
    assert.deepStrictEqual(
      calculateTemperatureCheckOutcome({
        results: [
          { vote: 'For', votePower: '60' },
          { vote: 'Against', votePower: '40' }
        ],
        quorumXrd: '100',
        approvalThreshold: '0.5'
      }),
      { quorumMet: true, approvalMet: true, passed: true }
    )
    assert.isFalse(
      calculateTemperatureCheckOutcome({
        results: [
          { vote: 'For', votePower: '49' },
          { vote: 'Against', votePower: '51' }
        ],
        quorumXrd: '100',
        approvalThreshold: '0.5'
      }).passed
    )
    assert.isFalse(
      calculateTemperatureCheckOutcome({
        results: [
          { vote: 'For', votePower: '59' },
          { vote: 'Against', votePower: '39' }
        ],
        quorumXrd: '100',
        approvalThreshold: '0.5'
      }).passed
    )
  })
})
