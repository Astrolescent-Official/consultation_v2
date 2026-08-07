// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, it, vi } from 'vitest'
import { EligibleVotingTokens } from './EligibleVotingTokens'

const stokenetXrdAddress =
  'resource_tdx_2_1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxtfd2jc'

vi.mock('@/hooks/useCurrentAccount', () => ({
  useCurrentAccount: () => ({ address: 'account_tdx_2_test' })
}))

vi.mock('@/atom/currentVotingPowerAtom', () => ({
  currentVotingPowerAtom: () => 'current-voting-power'
}))

vi.mock('@effect-atom/atom-react', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@effect-atom/atom-react')>()

  return {
    ...original,
    useAtomValue: () =>
      original.Result.success({
        votePower: '123',
        resourceBalances: { [stokenetXrdAddress]: '100.5' },
        validatorLsuBalances: [
          { resourceAddress: 'resource_tdx_2_lsu', amount: '12.25' }
        ],
        xrdResourceAddress: stokenetXrdAddress
      })
  }
})

afterEach(cleanup)

describe('EligibleVotingTokens', () => {
  it('explains the directly held voting assets and lists every configured DEX position', () => {
    render(<EligibleVotingTokens />)

    assert.isNotNull(screen.getByText('XRD'))
    assert.isNotNull(screen.getByText('Validator LSU tokens'))
    assert.isNotNull(screen.getByText('LSULP'))
    assert.isNotNull(screen.getByText('123 XRD'))
    assert.isNotNull(screen.getByText('In your wallet: 100.5'))
    assert.isNotNull(screen.getByText('12.25 · resource_tdx_2_lsu'))
    assert.isNotNull(screen.getByText(stokenetXrdAddress))
    assert.isAbove(screen.getAllByText('Ociswap V1').length, 0)
    assert.isAbove(screen.getAllByText('xwBTC/XRD').length, 0)
    assert.isAbove(screen.getAllByText('DefiPlaza Quote').length, 0)
    assert.isAbove(screen.getAllByText('hBNB/XRD').length, 0)
    assert.isAbove(screen.getAllByText('CaviarNine Shape').length, 0)
    assert.isAbove(screen.getAllByText('LSULP/XRD (v2)').length, 0)
    assert.isNotNull(
      screen.getByRole('columnheader', { name: 'In your wallet' })
    )
    assert.isNull(screen.queryByRole('columnheader', { name: 'Position' }))
    assert.isNull(screen.queryByRole('columnheader', { name: 'Pool' }))
    assert.strictEqual(screen.getAllByRole('row').length, 69)
  })
})
