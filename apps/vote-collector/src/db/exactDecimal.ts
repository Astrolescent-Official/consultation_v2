import BigNumber from 'bignumber.js'

const INTEGER_DIGITS = 80
const FRACTION_DIGITS = 80

const parseExactDecimal = (input: string) => {
  const value = new BigNumber(input)

  if (!value.isFinite() || value.isNegative()) {
    throw new RangeError(
      `Expected a finite non-negative decimal, received ${input}`
    )
  }

  const canonical = value.isZero() ? '0' : value.toFixed()
  const [integerPart = '0', fractionPart = ''] = canonical.split('.')

  if (integerPart.length > INTEGER_DIGITS) {
    throw new RangeError(`Decimal exceeds ${INTEGER_DIGITS} integer digits`)
  }
  if (fractionPart.length > FRACTION_DIGITS) {
    throw new RangeError(`Decimal exceeds ${FRACTION_DIGITS} fractional digits`)
  }

  return { canonical, integerPart, fractionPart }
}

export const canonicalDecimal = (input: string): string =>
  parseExactDecimal(input).canonical

export const decimalSortKey = (input: string): string => {
  const { integerPart, fractionPart } = parseExactDecimal(input)
  return `${integerPart.padStart(INTEGER_DIGITS, '0')}.${fractionPart.padEnd(
    FRACTION_DIGITS,
    '0'
  )}`
}
