import BigNumber from 'bignumber.js'
import { describe, expect, it } from 'vitest'
import { buildResourceBalances } from './resourceBalances'

describe('buildResourceBalances', () => {
  it('uses fixed-point fungible amounts and excludes burned NFT receipts', () => {
    expect(
      buildResourceBalances(
        [
          {
            resource_address: 'resource_fungible',
            amount: new BigNumber('0.00000001')
          }
        ],
        [
          {
            nonFungibleResources: [
              {
                resourceAddress: 'resource_non_fungible',
                items: [{ isBurned: false }, { isBurned: true }]
              }
            ]
          }
        ]
      )
    ).toEqual({
      resource_fungible: '0.00000001',
      resource_non_fungible: '1'
    })
  })
})
