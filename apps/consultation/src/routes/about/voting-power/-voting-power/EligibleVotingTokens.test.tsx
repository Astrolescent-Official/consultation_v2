// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, it } from 'vitest'
import { EligibleVotingTokens } from './EligibleVotingTokens'

afterEach(cleanup)

describe('EligibleVotingTokens', () => {
  it('explains the directly held voting assets and lists every configured DEX position', () => {
    render(<EligibleVotingTokens />)

    assert.isNotNull(screen.getByText('XRD'))
    assert.isNotNull(screen.getByText('Validator LSU tokens'))
    assert.isNotNull(screen.getByText('LSULP'))
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
