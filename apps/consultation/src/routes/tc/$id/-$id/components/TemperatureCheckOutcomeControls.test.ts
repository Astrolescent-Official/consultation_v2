import { calculateTemperatureCheckOutcome } from 'shared/governance/index'
import { assert, describe, it } from 'vitest'

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
      {
        forVotingPower: '60',
        againstVotingPower: '40',
        participationXrd: '100',
        quorumXrd: '100',
        quorumMet: true,
        approvalThreshold: '0.5',
        forShare: '0.6',
        approvalMet: true,
        calculatedPassed: true
      }
    )
    assert.isFalse(
      calculateTemperatureCheckOutcome({
        results: [
          { vote: 'For', votePower: '49' },
          { vote: 'Against', votePower: '51' }
        ],
        quorumXrd: '100',
        approvalThreshold: '0.5'
      }).calculatedPassed
    )
    assert.isFalse(
      calculateTemperatureCheckOutcome({
        results: [
          { vote: 'For', votePower: '59' },
          { vote: 'Against', votePower: '39' }
        ],
        quorumXrd: '100',
        approvalThreshold: '0.5'
      }).calculatedPassed
    )
  })
})
