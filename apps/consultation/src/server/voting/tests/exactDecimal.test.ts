import { describe, expect, it } from 'vitest'
import { canonicalDecimal, decimalSortKey } from '../db/exactDecimal'

describe('exact D1 decimal representation', () => {
  it('canonicalizes without converting through a JavaScript number', () => {
    expect(canonicalDecimal('000123.4500')).toBe('123.45')
    expect(canonicalDecimal('9007199254740993.000000000000000001')).toBe(
      '9007199254740993.000000000000000001'
    )
  })

  it('sorts non-negative decimal strings by numeric value', () => {
    const values = [
      '10',
      '2',
      '2.000000000000000001',
      '0.1',
      '9007199254740993'
    ]

    expect(
      [...values].sort((a, b) =>
        decimalSortKey(a).localeCompare(decimalSortKey(b))
      )
    ).toEqual(['0.1', '2', '2.000000000000000001', '10', '9007199254740993'])
  })

  it('rejects values that cannot represent vote power', () => {
    expect(() => canonicalDecimal('-1')).toThrow(RangeError)
    expect(() => canonicalDecimal('NaN')).toThrow(RangeError)
  })
})
