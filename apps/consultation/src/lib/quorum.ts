import BigNumber from 'bignumber.js'

/**
 * Whether total voting power meets a quorum. Both inputs are XRD amounts as
 * decimal strings, so this always compares with BigNumber precision rather
 * than the imprecise plain-`Number` sums a naive display calculation might
 * otherwise use.
 */
export function meetsQuorum(
  totalVotingPowerXrd: BigNumber.Value,
  quorumXrd: BigNumber.Value
): boolean {
  return new BigNumber(totalVotingPowerXrd).isGreaterThanOrEqualTo(
    new BigNumber(quorumXrd)
  )
}
