import type { GetFungibleBalanceOutput } from '@radix-effects/gateway'
import {
  AccountAddress,
  FungibleResourceAddress,
  NonFungibleResourceAddress
} from '@radix-effects/shared'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { findAdminBadge, renderAdminBadgeProof } from './adminBadge'

const accountAddress = AccountAddress.make('account_test')

describe('admin badge', () => {
  it('finds and renders a non-fungible badge proof', () => {
    const adminBadgeAddress = NonFungibleResourceAddress.make('resource_nft')
    const badge = findAdminBadge(
      accountAddress,
      adminBadgeAddress,
      [{ address: accountAddress, items: [] }],
      {
        items: [
          {
            address: accountAddress,
            nonFungibleResources: [
              {
                resourceAddress: adminBadgeAddress,
                items: [
                  {
                    id: '#1#',
                    lastUpdatedStateVersion: 1,
                    sbor: undefined,
                    isBurned: false
                  }
                ]
              }
            ]
          }
        ]
      }
    ).pipe(Option.getOrThrow)

    expect(badge).toEqual({
      _tag: 'NonFungibleAdminBadge',
      localId: '#1#'
    })
    expect(
      renderAdminBadgeProof(accountAddress, adminBadgeAddress, badge)
    ).toContain(`"create_proof_of_non_fungibles"
  Address("resource_nft")
  Array<NonFungibleLocalId>(
    NonFungibleLocalId("#1#")`)
  })

  it('finds and renders a fungible badge proof', () => {
    const adminBadgeAddress = FungibleResourceAddress.make('resource_fungible')
    const fungibleBalances = [
      {
        address: accountAddress,
        items: [
          {
            amount: { isGreaterThan: () => true },
            resource_address: adminBadgeAddress,
            last_updated_at_state_version: 1
          }
        ]
      }
    ] as unknown as GetFungibleBalanceOutput
    const badge = findAdminBadge(
      accountAddress,
      adminBadgeAddress,
      fungibleBalances,
      { items: [{ address: accountAddress, nonFungibleResources: [] }] }
    ).pipe(Option.getOrThrow)

    expect(badge).toEqual({ _tag: 'FungibleAdminBadge' })
    expect(
      renderAdminBadgeProof(accountAddress, adminBadgeAddress, badge)
    ).toContain(`"create_proof_of_amount"
  Address("resource_fungible")
  Decimal("1")`)
  })

  it('does not treat a burned non-fungible as an admin badge', () => {
    const adminBadgeAddress = NonFungibleResourceAddress.make('resource_nft')
    const badge = findAdminBadge(
      accountAddress,
      adminBadgeAddress,
      [{ address: accountAddress, items: [] }],
      {
        items: [
          {
            address: accountAddress,
            nonFungibleResources: [
              {
                resourceAddress: adminBadgeAddress,
                items: [
                  {
                    id: '#1#',
                    lastUpdatedStateVersion: 1,
                    sbor: undefined,
                    isBurned: true
                  }
                ]
              }
            ]
          }
        ]
      }
    )

    expect(Option.isNone(badge)).toBe(true)
  })
})
