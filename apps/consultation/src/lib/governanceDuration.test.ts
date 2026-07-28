import { describe, expect, it } from 'vitest'
import { governanceDurationUnitForNetworkId } from './governanceDuration'

describe('governanceDurationUnitForNetworkId', () => {
  it('uses minutes on Stokenet', () => {
    expect(governanceDurationUnitForNetworkId(2)).toBe('minute')
  })

  it('fails safe to days on Mainnet and unknown networks', () => {
    expect(governanceDurationUnitForNetworkId(1)).toBe('day')
    expect(governanceDurationUnitForNetworkId(242)).toBe('day')
  })
})
