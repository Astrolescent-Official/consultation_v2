import {
  GetFungibleBalance,
  type GetFungibleBalanceOutput,
  type GetNonFungibleBalanceOutput,
  GetNonFungibleBalanceService
} from '@radix-effects/gateway'
import type { AccountAddress } from '@radix-effects/shared'
import { Effect, Option } from 'effect'
import { GovernanceConfig } from './config'

export type AdminBadge =
  | { readonly _tag: 'FungibleAdminBadge' }
  | {
      readonly _tag: 'NonFungibleAdminBadge'
      readonly localId: string
    }

export const renderAdminBadgeProof = (
  accountAddress: AccountAddress,
  adminBadgeAddress: string,
  badge: AdminBadge
): string =>
  badge._tag === 'NonFungibleAdminBadge'
    ? `CALL_METHOD
  Address("${accountAddress}")
  "create_proof_of_non_fungibles"
  Address("${adminBadgeAddress}")
  Array<NonFungibleLocalId>(
    NonFungibleLocalId("${badge.localId}")
  )
;`
    : `CALL_METHOD
  Address("${accountAddress}")
  "create_proof_of_amount"
  Address("${adminBadgeAddress}")
  Decimal("1")
;`

export const findAdminBadge = (
  accountAddress: AccountAddress,
  adminBadgeAddress: string,
  fungibleBalances: GetFungibleBalanceOutput,
  nonFungibleBalances: GetNonFungibleBalanceOutput
): Option.Option<AdminBadge> => {
  const nonFungibleBadge = nonFungibleBalances.items
    .find((account) => account.address === accountAddress)
    ?.nonFungibleResources.find(
      (resource) => resource.resourceAddress === adminBadgeAddress
    )
    ?.items.find((item) => !item.isBurned)

  if (nonFungibleBadge) {
    return Option.some({
      _tag: 'NonFungibleAdminBadge',
      localId: nonFungibleBadge.id
    })
  }

  const fungibleBadge = fungibleBalances
    .find((account) => account.address === accountAddress)
    ?.items.find(
      (item) =>
        item.resource_address === adminBadgeAddress &&
        item.amount.isGreaterThan(0)
    )

  return fungibleBadge
    ? Option.some({ _tag: 'FungibleAdminBadge' })
    : Option.none()
}

export class AdminBadgeService extends Effect.Service<AdminBadgeService>()(
  'AdminBadgeService',
  {
    dependencies: [
      GetFungibleBalance.Default,
      GetNonFungibleBalanceService.Default
    ],
    effect: Effect.gen(function* () {
      const config = yield* GovernanceConfig
      const getFungibleBalance = yield* GetFungibleBalance
      const getNonFungibleBalance = yield* GetNonFungibleBalanceService

      const getForAccount = Effect.fn('AdminBadgeService.getForAccount')(
        function* (accountAddress: AccountAddress) {
          const [fungibleBalances, nonFungibleBalances] = yield* Effect.all(
            [
              getFungibleBalance({ addresses: [accountAddress] }),
              getNonFungibleBalance({
                addresses: [accountAddress],
                resourceAddresses: [config.adminBadgeAddress]
              })
            ],
            { concurrency: 2 }
          )

          return findAdminBadge(
            accountAddress,
            config.adminBadgeAddress,
            fungibleBalances,
            nonFungibleBalances
          )
        }
      )

      return { getForAccount }
    })
  }
) {}
